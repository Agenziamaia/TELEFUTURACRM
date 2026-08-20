// @ts-nocheck
"use client";

// WIDGET dell'Analisi (Luca 20/08 mattina): «un punto Sky è MOLTO diverso da
// un punto Vodafone, e un punto Vodafone mobile è diverso da uno del fisso» —
// quindi MAI somme di punti tra operatori o tra piste. Tutto è scoppiato PER
// OPERATORE e, dentro l'operatore, PER CATEGORIA, coi dettagli fini (telefoni
// finanziati vs non, GA vs CB, SIM dati, Rete Sicura, business…). Non si deve
// perdere nessun dato: ogni carta-operatore PARTIZIONA le vendite per
// categoria (Σ righe = totale, invariante verificata dal runner).
// Le aree Io e Negozio montano questi widget in una griglia modulare come la
// Home: ordine sparso, taglie 1/2/4, galleria per aggiungere.
//
// ctx (costruito in page.tsx): items (scope corrente), itemsStore (negozio
// intero, per le classifiche di squadra), itemsRete, itemsPrev, ext/extPrev
// (righe marginalità EXT del scope), margMap/margIcone, persona, negozio,
// negoziTutti, nG, ym, oggi, gl, meseCorrente, areaKey.

import { useMemo, useState } from "react";
import { TRK_BRAND_COLORS, TRK_BRAND_LOGOS } from "@/lib/brandAssets";
import { SelectOpzioni } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { Num, Tip, TipRiga, TipTitolo, AreaChart, RaceBars, HeatCal, Donut, Delta, fmtPt, fmtN } from "./_charts";

const norm = (s) => String(s || "").trim().toLowerCase();
export const GARA = {
    w3: { label: "WindTre", colore: TRK_BRAND_COLORS.windtre, logo: TRK_BRAND_LOGOS.windtre },
    vf: { label: "Vodafone", colore: TRK_BRAND_COLORS.vodafone, logo: TRK_BRAND_LOGOS.vodafone },
    fw: { label: "Fastweb", colore: TRK_BRAND_COLORS.fastweb, logo: TRK_BRAND_LOGOS.fastweb },
    sky: { label: "Sky", colore: TRK_BRAND_COLORS.sky, logo: TRK_BRAND_LOGOS.sky },
};
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const somma = (arr, f = (x) => x.punti) => Math.round(arr.reduce((s, x) => s + f(x), 0) * 100) / 100;

/* ═══ DETTAGLIO OPERATORE: partizione per categoria + sotto-dettagli ════ */
// Ritorna righe { emoji, label, colore, items } che PARTIZIONANO gli items
// del brand (nessuna vendita persa né doppia), più i chip trasversali.
const èTel = (c) => /^telefono a rate/i.test(String(c || ""));
const èCB = (p) => /cb\s*$/i.test(String(p || ""));
const èFin = (p) => /^finanziato/i.test(String(p || ""));

function righeOperatore(brand, sue) {
    const resto = new Set(sue);
    const prendi = (test) => { const out = []; for (const it of resto) if (test(it)) { out.push(it); resto.delete(it); } return out; };
    const R = [];
    const aggiungi = (emoji, label, colore, items, det) => { if (items.length) R.push({ emoji, label, colore, items, det: det || [] }); };
    const sub = (items, test) => items.filter(test).length;

    if (brand === "w3" || brand === "vf") {
        const biz = prendi((it) => /business/i.test(String(it.tipo || "")));
        const tel = prendi((it) => èTel(it.categoria));
        const telGa = tel.filter((it) => !èCB(it.prodotto)), telCb = tel.filter((it) => èCB(it.prodotto));
        const sim = prendi((it) => /^(mobile|sim)/i.test(String(it.categoria || "")));
        const fisso = prendi((it) => /^(fisso|fibra)/i.test(String(it.categoria || "")));
        const cb = prendi((it) => /^customer base/i.test(String(it.categoria || "")));
        const energia = prendi((it) => /^energia/i.test(String(it.categoria || "")));
        const prot = prendi((it) => /assicuraz|multi[- ]?serv|protez/i.test(String(it.categoria || "")));
        aggiungi("📱", "Mobile (SIM)", "#818cf8", sim, [
            ["GA", sub(sim, (it) => !/mnp/i.test(String(it.prodotto || "")))],
            ["MNP", sub(sim, (it) => /mnp/i.test(String(it.prodotto || "")))],
            ...(brand === "vf" ? [["di cui dati", sub(sim, (it) => /dati/i.test(String(it.prodotto || "")))], ["MNP escluse da lettera", sub(sim, (it) => it.esclusa)]] : []),
        ]);
        aggiungi("📲", "Telefoni GA", "#fb923c", telGa, [["finanziati", sub(telGa, (it) => èFin(it.prodotto))], ["a rate", sub(telGa, (it) => !èFin(it.prodotto))]]);
        aggiungi("📲", "Telefoni CB", "#f59e0b", telCb, [["finanziati", sub(telCb, (it) => èFin(it.prodotto))], ["a rate", sub(telCb, (it) => !èFin(it.prodotto))]]);
        aggiungi("🌐", "Fisso", "#22c55e", fisso, brand === "w3"
            ? [["con Più Sicuri C&U", sub(fisso, (it) => /home protect|più sicuri/i.test(String(it.opzioni || "")))]]
            : [["con Rete Sicura", sub(fisso, (it) => /rete sicura/i.test(String(it.opzioni || "")))]]);
        aggiungi("🔁", "Customer Base", "#eab308", cb, [
            ...(brand === "vf" ? [["Rete Sicura CB", sub(cb, (it) => /rete sicura/i.test(String(it.prodotto || "")))]] : []),
        ]);
        aggiungi("⚡", "Luce & Gas", "#84cc16", energia, brand === "vf" ? [["portate da Fastweb (lettera A)", sub(energia, (it) => it.fwInA)]] : []);
        aggiungi("🛡", "Protezione", "#14b8a6", prot);
        aggiungi("💼", "Business", "#a78bfa", biz, [
            ["mobile", sub(biz, (it) => /^(mobile|sim)/i.test(String(it.categoria || "")) || èTel(it.categoria))],
            ["fisso", sub(biz, (it) => /^(fisso|fibra)/i.test(String(it.categoria || "")))],
        ]);
    } else if (brand === "sky") {
        const tv = prendi((it) => /^tv/i.test(String(it.categoria || "")) && !/glass|prova/i.test(String(it.prodotto || "")));
        const glass = prendi((it) => /glass|prova/i.test(String(it.prodotto || "")));
        const treP = prendi((it) => /^3p/i.test(String(it.prodotto || "")));
        const fibra = prendi((it) => /^(fisso|fibra)/i.test(String(it.categoria || "")));
        const mnp = prendi((it) => /mnp/i.test(String(it.prodotto || "")));
        const ga = prendi((it) => /^mobile/i.test(String(it.categoria || "")) || /^mobile ga/i.test(String(it.prodotto || "")));
        aggiungi("📺", "Sky TV", "#0072c6", tv, [["promo 14,99", sub(tv, (it) => /14,99/i.test(String(it.offerta || "")))]]);
        aggiungi("🖥", "Glass & Prova", "#38bdf8", glass, [["Glass", sub(glass, (it) => /glass/i.test(String(it.offerta || it.prodotto || "")))], ["Prova Sky", sub(glass, (it) => /^prova/i.test(String(it.offerta || "")))]]);
        aggiungi("📦", "Triple Play", "#6366f1", treP, [["promo 29,90/27,90", sub(treP, (it) => /2[79],90/.test(String(it.offerta || "")))]]);
        aggiungi("🌐", "Sky Fibra", "#22c55e", fibra);
        aggiungi("📱", "Mobile MNP", "#818cf8", mnp);
        aggiungi("📱", "Mobile GA", "#a5b4fc", ga, [["ric. automatica", sub(ga, (it) => /ric\.? ?auto/i.test(String(it.categoria || "")))], ["ricarica pura", sub(ga, (it) => /wallet/i.test(String(it.categoria || "")))]]);
    } else if (brand === "fw") {
        const mob = prendi((it) => /^(mobile|sim)/i.test(String(it.categoria || "")) || èTel(it.categoria));
        const fis = prendi((it) => /^(fisso|fibra)/i.test(String(it.categoria || "")));
        const ene = prendi((it) => /^energia/i.test(String(it.categoria || "")));
        aggiungi("📱", "Mobile", "#facc15", mob);
        aggiungi("🌐", "Fisso", "#eab308", fis);
        aggiungi("⚡", "Energia", "#84cc16", ene);
    }
    if (resto.size) R.push({ emoji: "➕", label: "Altro", colore: "#64748b", items: [...resto], det: [] });
    return R;
}

/* ═══ CARTA OPERATORE ══════════════════════════════════════════════════ */
function CartaOperatore({ brand, ctx, size }) {
    const G = GARA[brand];
    const sue = useMemo(() => ctx.items.filter((it) => it.brandGara === brand), [ctx.items, brand]);
    const prev = useMemo(() => ctx.itemsPrev.filter((it) => it.brandGara === brand), [ctx.itemsPrev, brand]);
    const righe = useMemo(() => righeOperatore(brand, sue), [brand, sue]);
    const punti = somma(sue), pezzi = sue.length;
    const puntiPrev = somma(prev);
    const perPista = useMemo(() => {
        const per = {};
        for (const it of sue) if (it.pista) { (per[it.pista] ??= 0); per[it.pista] = Math.round((per[it.pista] + it.punti) * 100) / 100; }
        return Object.entries(per).sort((a, b) => b[1] - a[1]);
    }, [sue]);
    const senzaRiga = sue.filter((it) => it.senzaRiga).length;
    const escluse = sue.filter((it) => it.esclusa).length;
    const t1 = brand === "fw" ? ctx.items.filter((it) => it.brandGara === "vf" && it.fwInA).length : 0;
    const PISTA_L = { mobile: "Mobile", fisso: "Fisso", assicurazioni: "Assic.", lucegas: "L&G", sky: "Sky", cb: "CB", business_mobile: "Biz mob", business_fisso: "Biz fis", soluzioni_digitali: "Sol. dig.", vas: "VAS", luce: "Luce", gas: "Gas" };

    if (!pezzi) return (
        <div className="flex items-center gap-3 py-6 justify-center text-slate-500 text-xs">
            <img src={G.logo} alt="" className="h-5 opacity-40" /> nessuna vendita {G.label} nel periodo
        </div>
    );

    return (
        <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <div className="flex items-center gap-2">
                    <span className="h-8 w-8 rounded-xl grid place-items-center" style={{ background: `${G.colore}1f`, boxShadow: `inset 0 0 0 1px ${G.colore}44` }}>
                        <img src={G.logo} alt={G.label} className="h-4 w-4 object-contain" />
                    </span>
                    <div>
                        <p className="text-sm font-black text-white leading-none">{G.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{fmtN(pezzi)} pezzi · <Delta v={punti - puntiPrev} /> <span className="text-slate-600">pt vs mese scorso</span></p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                    {brand === "fw"
                        ? <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-slate-300 border border-white/10">gara T2 · a pezzi</span>
                        : perPista.map(([p, v]) => (
                            <span key={p} className="px-2 py-1 rounded-lg text-[10px] font-bold border border-white/10" style={{ background: `${G.colore}14`, color: "#fff" }}>
                                {PISTA_L[p] || p} <span className="tabular-nums" style={{ color: G.colore }}>{fmtPt(v)}</span> pt
                            </span>
                        ))}
                </div>
            </div>

            <div className={cn("flex gap-4", size >= 4 ? "flex-row items-start" : "flex-col sm:flex-row sm:items-start")}>
                <div className="shrink-0 mx-auto sm:mx-0">
                    <Donut size={size >= 4 ? 168 : 138} unit={brand === "fw" ? "pezzi" : "punti"}
                        slices={righe.map((r) => ({ label: r.label, emoji: r.emoji, colore: r.colore, val: brand === "fw" ? r.items.length : somma(r.items), det: [{ l: "pezzi", r: fmtN(r.items.length) }, ...(brand === "fw" ? [] : [{ l: "punti", r: fmtPt(somma(r.items)) }])] }))}
                        centro={<>
                            <span className="text-2xl font-black text-white tabular-nums leading-none">{brand === "fw" ? <Num v={pezzi} punti={false} /> : <Num v={punti} punti />}</span>
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">{brand === "fw" ? "pezzi" : "punti totali"}</span>
                        </>} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                    {righe.map((r) => {
                        const pt = somma(r.items);
                        return (
                            <Tip key={r.label} block tip={<div>
                                <TipTitolo>{r.emoji} {r.label}</TipTitolo>
                                <TipRiga l="pezzi" r={fmtN(r.items.length)} colore={r.colore} />
                                {brand !== "fw" && <TipRiga l="punti" r={fmtPt(pt)} />}
                                {r.det.map(([l, v]) => <TipRiga key={l} l={l} r={fmtN(v)} />)}
                            </div>}>
                                <div className="grid grid-cols-[minmax(110px,1.1fr)_2fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors">
                                    <span className="text-xs font-semibold text-slate-200 truncate">{r.emoji} {r.label}</span>
                                    <span className="h-2 rounded-full bg-white/5 overflow-hidden">
                                        <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, ((brand === "fw" ? r.items.length : pt) / Math.max(1, brand === "fw" ? pezzi : punti)) * 100)}%`, background: `linear-gradient(90deg, ${r.colore}55, ${r.colore})` }} />
                                    </span>
                                    <span className="text-[11px] font-black text-white tabular-nums text-right w-14">{brand === "fw" ? `${fmtN(r.items.length)} pz` : `${fmtPt(pt)} pt`}</span>
                                    <span className="text-[10px] text-slate-500 tabular-nums text-right w-20 truncate">
                                        {brand === "fw" ? "" : `${fmtN(r.items.length)} pz`}{r.det.length > 0 && r.det[0][1] > 0 ? ` · ${r.det[0][0]} ${fmtN(r.det[0][1])}` : ""}
                                    </span>
                                </div>
                            </Tip>
                        );
                    })}
                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                        {escluse > 0 && <Tip tip={<div><TipTitolo>Esclusioni lettera A</TipTitolo><p className="text-[11px] text-slate-300 max-w-[220px]">MNP con provenienza Vodafone/Fastweb/Ho.: contano come pezzi ma la lettera non dà punti.</p></div>}><span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-400">🚫 {escluse} MNP escluse</span></Tip>}
                        {senzaRiga > 0 && <Tip tip={<div><TipTitolo>Senza riga di gara</TipTitolo><p className="text-[11px] text-slate-300 max-w-[220px]">Vendite del perimetro che non agganciano nessuna riga del tabellare: pezzi sì, punti no.</p></div>}><span className="px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/25 text-[10px] text-amber-200">⚠ {senzaRiga} senza punti</span></Tip>}
                        {t1 > 0 && <Tip tip={<div><TipTitolo>Fastweb su codici T1</TipTitolo><p className="text-[11px] text-slate-300 max-w-[220px]">Contano nella gara Vodafone (lettera A): i punti stanno nella carta Vodafone.</p></div>}><span className="px-2 py-0.5 rounded-md bg-yellow-400/10 border border-yellow-400/25 text-[10px] text-yellow-200">🟨 {t1} in gara Vodafone</span></Tip>}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══ MARGINALITÀ ESPLOSA (quantitativa; il valore arriva con lo switch) ═ */
function WidgetMarg({ ctx, size }) {
    const qtyDi = (r) => Math.max(1, Number(r.qty) || 1);
    const catDi = (p) => ctx.margMap?.get(norm(p))?.cat || (/(telefono|tnp|smartphone|iphone)/i.test(String(p || "")) ? "Telefoni" : "Altro");
    const icona = (nome) => nome === "Telefoni" ? "📱" : (ctx.margIcone?.get(nome) || "🧩");
    const righe = ctx.ext || [];
    const prev = ctx.extPrev || [];
    const pezzi = righe.reduce((s, r) => s + qtyDi(r), 0);
    const pezziPrev = prev.reduce((s, r) => s + qtyDi(r), 0);
    const COLORI = ["#818cf8", "#22c55e", "#f59e0b", "#0072c6", "#e879f9", "#14b8a6", "#f97316", "#64748b"];
    const perCat = useMemo(() => {
        const per = {};
        for (const r of righe) { const c = catDi(r.prodotto); (per[c] ??= { qty: 0, prodotti: {} }); per[c].qty += qtyDi(r); per[c].prodotti[r.prodotto] = (per[c].prodotti[r.prodotto] || 0) + qtyDi(r); }
        return Object.entries(per).sort((a, b) => b[1].qty - a[1].qty);
    }, [righe]);
    const topProdotti = useMemo(() => {
        const per = {};
        for (const r of righe) per[r.prodotto] = (per[r.prodotto] || 0) + qtyDi(r);
        return Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, size >= 4 ? 10 : 6);
    }, [righe, size]);
    const perGiorno = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: `${String(i + 1).padStart(2, "0")} ${MESI[ctx.ym.m - 1]}`, val: 0, det: [] }));
        for (const r of righe) if (r.g >= 1 && r.g <= ctx.nG) v[r.g - 1].val += qtyDi(r);
        return v;
    }, [righe, ctx.nG, ctx.ym]);

    if (!righe.length) return <p className="text-xs text-slate-500 py-6 text-center">Nessuna vendita di marginalità nel periodo.</p>;
    return (
        <div className={cn("flex gap-5", size >= 4 ? "flex-col lg:flex-row" : "flex-col")}>
            <div className="flex items-start gap-4 shrink-0">
                <Donut size={150} unit="pezzi"
                    slices={perCat.map(([c, v], i) => ({ label: c, emoji: icona(c), colore: COLORI[i % COLORI.length], val: v.qty, det: Object.entries(v.prodotti).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, q]) => ({ l: p.slice(0, 26), r: fmtN(q) })) }))}
                    centro={<><span className="text-2xl font-black text-white tabular-nums leading-none"><Num v={pezzi} punti={false} /></span><span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">pezzi</span></>} />
                <div className="space-y-1 pt-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Categorie</p>
                    {perCat.slice(0, 7).map(([c, v], i) => (
                        <div key={c} className="flex items-center gap-2 text-[11px]">
                            <span className="w-2 h-2 rounded-full" style={{ background: COLORI[i % COLORI.length] }} />
                            <span className="text-slate-300">{icona(c)} {c}</span>
                            <b className="text-white tabular-nums ml-auto pl-3">{fmtN(v.qty)}</b>
                        </div>
                    ))}
                    <p className="pt-1"><Delta v={pezzi - pezziPrev} /> <span className="text-[10px] text-slate-500">pezzi vs mese scorso</span></p>
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Top prodotti (per pezzi)</p>
                <RaceBars unit="pz" righe={topProdotti.map(([p, q], i) => ({ k: p, label: p, val: q, colore: COLORI[i % COLORI.length], det: [{ l: "pezzi", r: fmtN(q) }, { l: "categoria", r: catDi(p) }] }))} />
                {size >= 4 && <div className="mt-3"><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Ritmo del mese</p><HeatCal giorni={perGiorno} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} colore="#22c55e" /></div>}
                <p className="mt-2 text-[10px] text-slate-600">quantitativo · lo switch a VALORE (€) arriva quando gli operatori saranno tutti configurati</p>
            </div>
        </div>
    );
}

/* ═══ ALTRI WIDGET ═════════════════════════════════════════════════════ */
// posizioni per brand: mai classifiche su somme cross-operatore
function rankDi(items, brand, chiave, valore) {
    const per = new Map();
    for (const it of items) { if (it.brandGara !== brand) continue; const k = it[chiave]; if (!k || k === "—") continue; per.set(k, Math.round(((per.get(k) || 0) + it.punti) * 100) / 100); }
    const ord = [...per.entries()].sort((a, b) => b[1] - a[1]);
    const idx = ord.findIndex(([k]) => norm(k) === norm(valore));
    return { pos: idx >= 0 ? idx + 1 : 0, su: ord.length, sopra: idx > 0 ? { k: ord[idx - 1][0], gap: Math.round((ord[idx - 1][1] - (ord[idx]?.[1] || 0)) * 100) / 100 } : null };
}

function WidgetPosizioni({ ctx }) {
    const brands = ["w3", "vf", "sky"];
    const righe = brands.map((b) => {
        const negozioR = rankDi(ctx.itemsRete.filter((it) => norm(it.negozio) === norm(ctx.negozioCasa)), b, "venditore", ctx.persona);
        const reteR = rankDi(ctx.itemsRete, b, "venditore", ctx.persona);
        return { b, negozioR, reteR };
    }).filter((r) => r.reteR.pos > 0);
    if (!righe.length) return <p className="text-xs text-slate-500 py-4 text-center">Nessun punto nel periodo.</p>;
    return (
        <div className="space-y-2">
            {righe.map(({ b, negozioR, reteR }) => (
                <div key={b} className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-white/5">
                    <img src={GARA[b].logo} alt="" className="h-4 w-4 object-contain" />
                    <span className="text-xs font-semibold text-slate-200 flex-1">{GARA[b].label}</span>
                    <Tip tip={<div><TipTitolo>{GARA[b].label} in {ctx.negozioCasa}</TipTitolo><TipRiga l="posizione" r={`${negozioR.pos}º su ${negozioR.su}`} /></div>}>
                        <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums", negozioR.pos === 1 ? "bg-amber-400/15 text-amber-300" : "bg-white/5 text-slate-300")}>🏪 {negozioR.pos}º</span>
                    </Tip>
                    <Tip tip={<div><TipTitolo>{GARA[b].label} in rete</TipTitolo><TipRiga l="posizione" r={`${reteR.pos}º su ${reteR.su}`} /></div>}>
                        <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums", reteR.pos === 1 ? "bg-amber-400/15 text-amber-300" : "bg-white/5 text-slate-300")}>🌍 {reteR.pos}º</span>
                    </Tip>
                </div>
            ))}
            <p className="text-[10px] text-slate-600 text-center pt-0.5">classifiche SEMPRE per operatore — i punti non si sommano tra brand</p>
        </div>
    );
}

function WidgetBersaglio({ ctx }) {
    const brands = ["w3", "vf", "sky"];
    const bersagli = brands.map((b) => {
        const r = rankDi(ctx.itemsRete.filter((it) => norm(it.negozio) === norm(ctx.negozioCasa)), b, "venditore", ctx.persona);
        return r.sopra && r.sopra.gap > 0 ? { b, ...r.sopra, pos: r.pos } : null;
    }).filter(Boolean).sort((a, b) => a.gap - b.gap);
    if (!bersagli.length) return <p className="text-sm text-center py-4 text-amber-100">Sei in testa su tutti i fronti del tuo negozio 👑</p>;
    return (
        <div className="space-y-2">
            {bersagli.slice(0, 3).map((t) => (
                <div key={t.b} className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2">
                    <img src={GARA[t.b].logo} alt="" className="h-4 w-4 object-contain" />
                    <p className="text-xs text-amber-100 flex-1"><b className="tabular-nums">{fmtPt(t.gap)} pt {GARA[t.b].label}</b> per superare {t.k}</p>
                    <span className="text-lg">🎯</span>
                </div>
            ))}
        </div>
    );
}

function WidgetPesoNegozi({ ctx }) {
    const per = new Map();
    for (const it of ctx.itemsRete) { if (norm(it.venditore) !== norm(ctx.persona)) continue; per.set(it.negozio, (per.get(it.negozio) || 0) + 1); }
    const negozi = [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!negozi.length) return <p className="text-xs text-slate-500 py-4 text-center">Nessuna vendita nel periodo.</p>;
    return (
        <div>
            <div className="flex flex-wrap items-center justify-around gap-3">
                {negozi.slice(0, 3).map((n) => {
                    const brands = ["w3", "vf", "sky", "fw"];
                    const mieiPz = ctx.itemsRete.filter((it) => norm(it.venditore) === norm(ctx.persona) && it.negozio === n).length;
                    const totPz = ctx.itemsRete.filter((it) => it.negozio === n).length;
                    const det = brands.map((b) => {
                        const miei = somma(ctx.itemsRete.filter((it) => norm(it.venditore) === norm(ctx.persona) && it.negozio === n && it.brandGara === b));
                        const tot = somma(ctx.itemsRete.filter((it) => it.negozio === n && it.brandGara === b));
                        return tot > 0 ? { l: `${GARA[b].label}`, r: `${fmtPt(miei)}/${fmtPt(tot)} pt`, colore: GARA[b].colore } : null;
                    }).filter(Boolean);
                    return (
                        <Tip key={n} tip={<div><TipTitolo>{n}</TipTitolo><TipRiga l="tuoi pezzi" r={`${fmtN(mieiPz)}/${fmtN(totPz)}`} />{det.map((d, i) => <TipRiga key={i} {...d} />)}</div>}>
                            <div className="text-center">
                                <div className="relative w-[92px] h-[92px] mx-auto grid place-items-center rounded-full" style={{ background: `conic-gradient(var(--tf-f97316) ${totPz ? (mieiPz / totPz) * 360 : 0}deg, rgba(255,255,255,.06) 0deg)` }}>
                                    <div className="w-[72px] h-[72px] rounded-full bg-[#10132a] grid place-items-center flex-col">
                                        <span className="text-lg font-black text-white tabular-nums">{totPz ? Math.round((mieiPz / totPz) * 100) : 0}%</span>
                                    </div>
                                </div>
                                <p className="mt-1 text-[10px] text-slate-400 font-semibold">{n}</p>
                            </div>
                        </Tip>
                    );
                })}
            </div>
            <p className="mt-2 text-[10px] text-slate-500 text-center">quota sui PEZZI del negozio · nel dettaglio i punti brand per brand{negozi.length > 1 ? " · presidi più negozi 💪" : ""}</p>
        </div>
    );
}

function WidgetSquadra({ ctx, metrica }) {
    const per = new Map();
    for (const it of ctx.itemsStore) { const k = it.venditore; if (!k || k === "—") continue; (per.get(k) || per.set(k, []).get(k)).push(it); }
    const righe = [...per.entries()].map(([k, its]) => {
        const val = metrica === "pezzi" ? its.length : somma(its.filter((it) => it.brandGara === metrica));
        const det = metrica === "pezzi"
            ? Object.entries(GARA).map(([b, g]) => { const n = its.filter((it) => it.brandGara === b).length; return n ? { l: g.label, r: `${fmtN(n)} pz`, colore: g.colore } : null; }).filter(Boolean)
            : righeOperatore(metrica, its.filter((it) => it.brandGara === metrica)).map((r) => ({ l: `${r.emoji} ${r.label}`, r: `${fmtPt(somma(r.items))} pt · ${r.items.length} pz`, colore: r.colore }));
        return { k, label: k, val, det, me: norm(k) === norm(ctx.persona), colore: metrica === "pezzi" ? "var(--tf-818cf8)" : GARA[metrica].colore };
    }).filter((r) => r.val > 0).sort((a, b) => b.val - a.val);
    return <RaceBars unit={metrica === "pezzi" ? "pz" : "pt"} righe={righe} vuoto="Nessuna vendita nel periodo." />;
}

function WidgetDuello({ ctx }) {
    const [rivaleSel, setRivaleSel] = useState("");
    const rivale = rivaleSel || ctx.negoziTutti.find((n) => norm(n) !== norm(ctx.negozio)) || "";
    const mio = ctx.itemsRete.filter((it) => norm(it.negozio) === norm(ctx.negozio));
    const suo = ctx.itemsRete.filter((it) => norm(it.negozio) === norm(rivale));
    const brands = ["w3", "vf", "sky"];
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-white">{ctx.negozio}</span>
                <span className="text-[10px] text-slate-500">vs</span>
                <SelectOpzioni value={rivale} onChange={setRivaleSel} opzioni={ctx.negoziTutti.filter((n) => norm(n) !== norm(ctx.negozio))} placeholder="sfida…" className="min-w-[130px]" />
            </div>
            <div className="space-y-2.5">
                {brands.map((b) => {
                    const a = somma(mio.filter((it) => it.brandGara === b)), c = somma(suo.filter((it) => it.brandGara === b));
                    if (!a && !c) return null;
                    const max = Math.max(a, c, 1);
                    return (
                        <div key={b}>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5"><img src={GARA[b].logo} className="h-3 w-3 object-contain" alt="" />{GARA[b].label}</div>
                            {[[a, "var(--tf-818cf8)"], [c, GARA[b].colore]].map(([v, col], i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden"><span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: col }} /></span>
                                    <span className="text-[10px] font-bold text-white tabular-nums w-12 text-right">{fmtPt(v)}</span>
                                </div>
                            ))}
                        </div>
                    );
                })}
                <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[10px] text-slate-500">pezzi: <b className="text-slate-300 tabular-nums">{fmtN(mio.length)}</b> vs <b className="text-slate-300 tabular-nums">{fmtN(suo.length)}</b></span>
                </div>
            </div>
        </div>
    );
}

function WidgetMese({ ctx, brand }) {
    const filtra = (arr) => brand === "pezzi" ? arr : arr.filter((it) => it.brandGara === brand);
    const serie = useMemo(() => {
        const perG = Array.from({ length: ctx.nG }, () => ({ tot: 0, brand: {} }));
        for (const it of filtra(ctx.items)) { if (it.g < 1 || it.g > ctx.nG) continue; const v = brand === "pezzi" ? 1 : it.punti; perG[it.g - 1].tot += v; perG[it.g - 1].brand[it.brandGara] = (perG[it.g - 1].brand[it.brandGara] || 0) + v; }
        let cum = 0;
        return perG.map((d, i) => { cum += d.tot; return { x: `${String(i + 1).padStart(2, "0")} ${MESI[ctx.ym.m - 1].slice(0, 3)}`, y: Math.round(cum * 100) / 100, det: [{ l: "nel giorno", r: `+${fmtPt(d.tot)}` }, ...Object.entries(d.brand).map(([k, v]) => ({ l: GARA[k].label, r: `+${fmtPt(v)}`, colore: GARA[k].colore }))] }; });
    }, [ctx.items, ctx.nG, ctx.ym, brand]);
    const ghost = useMemo(() => {
        const perG = Array.from({ length: ctx.nG }, () => 0);
        for (const it of filtra(ctx.itemsPrev)) if (it.g >= 1 && it.g <= ctx.nG) perG[it.g - 1] += brand === "pezzi" ? 1 : it.punti;
        let cum = 0; return perG.map((v) => ({ y: Math.round((cum += v) * 100) / 100 }));
    }, [ctx.itemsPrev, ctx.nG, brand]);
    return (
        <div>
            <AreaChart serie={serie} ghost={ghost} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} colore={brand === "pezzi" ? "var(--tf-818cf8)" : GARA[brand].colore} h={170} unit={brand === "pezzi" ? "pz" : "pt"} />
            <p className="mt-1 text-[10px] text-slate-500">cumulato {brand === "pezzi" ? "PEZZI (tutti gli operatori)" : `punti ${GARA[brand].label}`} · tratteggio = mese scorso</p>
        </div>
    );
}

function WidgetRitmo({ ctx }) {
    const giorni = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: `${String(i + 1).padStart(2, "0")} ${MESI[ctx.ym.m - 1]}`, val: 0, det: [] }));
        const perB = {};
        for (const it of ctx.items) { if (it.g < 1 || it.g > ctx.nG) continue; v[it.g - 1].val++; (perB[it.g] ??= {}); perB[it.g][it.brandGara] = (perB[it.g][it.brandGara] || 0) + 1; }
        v.forEach((d) => { d.det = Object.entries(perB[d.n] || {}).map(([k, n]) => ({ l: GARA[k].label, r: `${fmtN(n)} pz`, colore: GARA[k].colore })); });
        return v;
    }, [ctx.items, ctx.nG, ctx.ym]);
    return <HeatCal giorni={giorni} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} colore="var(--tf-818cf8)" />;
}

function WidgetMixPezzi({ ctx }) {
    return (
        <div className="flex justify-center">
            <Donut size={160} unit="pezzi"
                slices={Object.entries(GARA).map(([b, g]) => {
                    const sue = ctx.items.filter((it) => it.brandGara === b);
                    return { label: g.label, colore: g.colore, val: sue.length, det: righeOperatore(b, sue).slice(0, 5).map((r) => ({ l: `${r.emoji} ${r.label}`, r: fmtN(r.items.length), colore: r.colore })) };
                })}
                centro={<><span className="text-2xl font-black text-white tabular-nums leading-none"><Num v={ctx.items.length} punti={false} /></span><span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">pezzi totali</span></>} />
        </div>
    );
}

/* ═══ REGISTRO ═════════════════════════════════════════════════════════ */
export const REGISTRO = {
    "op:w3": { nome: "WindTre — scoppiato", emoji: "🟠", gruppo: "operatori", def: 2, solo: null, render: (ctx, size) => <CartaOperatore brand="w3" ctx={ctx} size={size} /> },
    "op:vf": { nome: "Vodafone — scoppiato", emoji: "🔴", gruppo: "operatori", def: 2, render: (ctx, size) => <CartaOperatore brand="vf" ctx={ctx} size={size} /> },
    "op:sky": { nome: "Sky — scoppiato", emoji: "🔵", gruppo: "operatori", def: 2, render: (ctx, size) => <CartaOperatore brand="sky" ctx={ctx} size={size} /> },
    "op:fw": { nome: "Fastweb T2 — scoppiato", emoji: "🟡", gruppo: "operatori", def: 2, render: (ctx, size) => <CartaOperatore brand="fw" ctx={ctx} size={size} /> },
    "marg": { nome: "Marginalità — esplosa", emoji: "💰", gruppo: "marginalità", def: 4, render: (ctx, size) => <WidgetMarg ctx={ctx} size={size} /> },
    "posizioni": { nome: "Posizioni per operatore", emoji: "🏅", gruppo: "obiettivi", def: 1, solo: "io", render: (ctx) => <WidgetPosizioni ctx={ctx} /> },
    "bersaglio": { nome: "Bersagli da superare", emoji: "🎯", gruppo: "obiettivi", def: 1, solo: "io", render: (ctx) => <WidgetBersaglio ctx={ctx} /> },
    "pesonegozi": { nome: "Il mio peso nei negozi", emoji: "⚖️", gruppo: "obiettivi", def: 1, solo: "io", render: (ctx) => <WidgetPesoNegozi ctx={ctx} /> },
    "squadra:pezzi": { nome: "Squadra — per pezzi", emoji: "🏆", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="pezzi" /> },
    "squadra:w3": { nome: "Squadra — punti WindTre", emoji: "🟠", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="w3" /> },
    "squadra:vf": { nome: "Squadra — punti Vodafone", emoji: "🔴", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="vf" /> },
    "squadra:sky": { nome: "Squadra — punti Sky", emoji: "🔵", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="sky" /> },
    "duello": { nome: "Duello tra negozi", emoji: "⚔️", gruppo: "squadra", def: 1, solo: "negozio", render: (ctx) => <WidgetDuello ctx={ctx} /> },
    "mese:pezzi": { nome: "Andamento — pezzi", emoji: "📈", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="pezzi" /> },
    "mese:w3": { nome: "Andamento — punti WindTre", emoji: "🟠", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="w3" /> },
    "mese:vf": { nome: "Andamento — punti Vodafone", emoji: "🔴", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="vf" /> },
    "mese:sky": { nome: "Andamento — punti Sky", emoji: "🔵", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="sky" /> },
    "ritmo": { nome: "Ritmo del mese", emoji: "🗓", gruppo: "andamento", def: 1, render: (ctx) => <WidgetRitmo ctx={ctx} /> },
    "mix:pezzi": { nome: "Mix operatori (pezzi)", emoji: "🧬", gruppo: "andamento", def: 1, render: (ctx) => <WidgetMixPezzi ctx={ctx} /> },
};
export const GRUPPI = ["operatori", "marginalità", "squadra", "obiettivi", "andamento"];
export const DEFAULT_LAYOUT = {
    io: ["op:w3@2", "op:vf@2", "op:sky@2", "op:fw@2", "posizioni@1", "bersaglio@1", "pesonegozi@2", "marg@4", "mese:pezzi@2", "mix:pezzi@1", "ritmo@1"],
    negozio: ["op:w3@2", "op:vf@2", "op:sky@2", "op:fw@2", "squadra:pezzi@2", "duello@1", "mix:pezzi@1", "marg@4", "mese:pezzi@2", "ritmo@1", "squadra:w3@2"],
};
