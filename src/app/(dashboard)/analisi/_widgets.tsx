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
import { TRK_BRAND_COLORS, TRK_BRAND_LOGOS, TRK_LOGO_SCALE, trkBrandKey } from "@/lib/brandAssets";
import { SelectOpzioni } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { Num, Tip, TipRiga, TipTitolo, BarStack, RaceBars, HeatCal, Donut, Delta, fmtPt, fmtN, fmtEuro } from "./_charts";

const norm = (s) => String(s || "").trim().toLowerCase();
export const GARA = {
    w3: { label: "WindTre", chiave: "windtre", colore: TRK_BRAND_COLORS.windtre, logo: TRK_BRAND_LOGOS.windtre },
    vf: { label: "Vodafone", chiave: "vodafone", colore: TRK_BRAND_COLORS.vodafone, logo: TRK_BRAND_LOGOS.vodafone },
    fw: { label: "Fastweb", chiave: "fastweb", colore: TRK_BRAND_COLORS.fastweb, logo: TRK_BRAND_LOGOS.fastweb },
    sky: { label: "Sky", chiave: "sky", colore: TRK_BRAND_COLORS.sky, logo: TRK_BRAND_LOGOS.sky },
};
// LOGO AL POSTO DELLE SCRITTE (Luca 21/08): i marchi 900×900 (W3, VF…) hanno
// il logo annegato nel canvas trasparente — senza la scala ottica del
// Tracking sembrano francobolli. Il logo PARLA, niente nome scritto accanto.
// origine "left": il logo grande delle carte si ancora al bordo sinistro e
// RISERVA lo spazio della sua misura visiva — con l'origine centrata la scala
// 1.95 di Vodafone sbordava fuori dalla carta (visto da Luca 21/08). La scala
// qui è calmierata: siamo inline, non nelle tessere del Tracking.
export function LogoBrand({ chiave, colore, alt = "", h = 26, className, origine = "center" }) {
    const scala = Math.min(TRK_LOGO_SCALE[chiave] || 1.1, 1.55);
    const sinistra = origine === "left";
    return (
        <span className={cn("inline-grid overflow-visible shrink-0", sinistra ? "justify-items-start items-center" : "place-items-center", className)}
            style={{ height: h, width: h * 1.9 * (sinistra ? scala : 1) }}>
            <img src={TRK_BRAND_LOGOS[chiave]} alt={alt || chiave} className="object-contain"
                style={{ height: h, maxWidth: h * 1.9, transform: `scale(${scala})`, transformOrigin: sinistra ? "left center" : "center", filter: colore ? `drop-shadow(0 0 7px ${colore}66)` : undefined }} />
        </span>
    );
}
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
        aggiungi("📺", "Sky TV", "#8b5cf6", tv, [["promo 14,99", sub(tv, (it) => /14,99/i.test(String(it.offerta || "")))]]);
        aggiungi("🖥", "Glass & Prova", "#a78bfa", glass, [["Glass", sub(glass, (it) => /glass/i.test(String(it.offerta || it.prodotto || "")))], ["Prova Sky", sub(glass, (it) => /^prova/i.test(String(it.offerta || "")))]]);
        aggiungi("📡", "Triple Play", "#7c3aed", treP, [["promo 29,90/27,90", sub(treP, (it) => /2[79],90/.test(String(it.offerta || "")))]]);
        aggiungi("🌐", "Sky Fibra", "#22c55e", fibra);
        aggiungi("📱", "Mobile MNP", "#818cf8", mnp);
        aggiungi("📱", "Mobile GA", "#c084fc", ga, [["ric. automatica", sub(ga, (it) => /ric\.? ?auto/i.test(String(it.categoria || "")))], ["ricarica pura", sub(ga, (it) => /wallet/i.test(String(it.categoria || "")))]]);
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
                <div className="flex items-center gap-3 min-w-0">
                    <LogoBrand chiave={G.chiave} colore={G.colore} alt={G.label} h={30} origine="left" />
                    <p className="text-[10px] text-slate-500 whitespace-nowrap">{fmtN(pezzi)} pezzi{ctx.confronto && <> · <Delta v={punti - puntiPrev} /> <span className="text-slate-600">pt vs mese scorso</span></>}</p>
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

/* ═══ MARGINALITÀ in VALORE VENDUTO (Luca 21/08) ═══════════════════════
   Qui si parla di € VENDUTI (dettagli.price = totale riga, già ×qty), coi
   pezzi come dato di contorno. L'UTILE (pagato dei contratti + ricavo della
   marginalità al netto di IVA e costi) arriverà nella sezione a valore. */
function WidgetMarg({ ctx, size }) {
    const qtyDi = (r) => Math.max(1, Number(r.qty) || 1);
    const valDi = (r) => Number(r.prezzo) || 0;
    // fallback per i prodotti fuori pannello: i Bundle hanno la LORO categoria
    // (Luca 21/08 — non finiscono in Altro), i telefoni idem
    const catDi = (p) => ctx.margMap?.get(norm(p))?.cat || (/bundle/i.test(String(p || "")) ? "Bundle" : /(telefono|tnp|smartphone|iphone)/i.test(String(p || "")) ? "Telefoni" : "Altro");
    const icona = (nome) => nome === "Telefoni" ? "📱" : nome === "Bundle" ? "🎁" : (ctx.margIcone?.get(nome) || "🧩");
    const righe = ctx.ext || [];
    const prev = ctx.extPrev || [];
    const venduto = righe.reduce((s, r) => s + valDi(r), 0);
    const vendutoPrev = prev.reduce((s, r) => s + valDi(r), 0);
    const pezzi = righe.reduce((s, r) => s + qtyDi(r), 0);
    const COLORI = ["#818cf8", "#22c55e", "#f59e0b", "#8b5cf6", "#e879f9", "#14b8a6", "#f97316", "#64748b"];
    const perCat = useMemo(() => {
        const per = {};
        for (const r of righe) { const c = catDi(r.prodotto); (per[c] ??= { val: 0, qty: 0, prodotti: {} }); per[c].val += valDi(r); per[c].qty += qtyDi(r); per[c].prodotti[r.prodotto] = (per[c].prodotti[r.prodotto] || 0) + valDi(r); }
        return Object.entries(per).sort((a, b) => b[1].val - a[1].val);
    }, [righe]);
    const topProdotti = useMemo(() => {
        const per = {};
        for (const r of righe) { (per[r.prodotto] ??= { val: 0, qty: 0 }); per[r.prodotto].val += valDi(r); per[r.prodotto].qty += qtyDi(r); }
        return Object.entries(per).sort((a, b) => b[1].val - a[1].val).slice(0, size >= 4 ? 10 : 6);
    }, [righe, size]);
    const perGiorno = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, val: 0, det: [] }));
        for (const r of righe) if (r.g >= 1 && r.g <= ctx.nG) { v[r.g - 1].val += valDi(r); }
        v.forEach((d) => { d.val = Math.round(d.val); });
        return v;
    }, [righe, ctx.nG, ctx.labels]);

    if (!righe.length) return <p className="text-xs text-slate-500 py-6 text-center">Nessuna vendita di marginalità nel periodo.</p>;
    return (
        <div className={cn("flex gap-5", size >= 4 ? "flex-col lg:flex-row" : "flex-col")}>
            <div className="flex items-start gap-4 shrink-0">
                <Donut size={156} unit="€ venduti"
                    slices={perCat.map(([c, v], i) => ({ label: c, emoji: icona(c), colore: COLORI[i % COLORI.length], val: Math.round(v.val), det: [{ l: "pezzi", r: fmtN(v.qty) }, ...Object.entries(v.prodotti).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, q]) => ({ l: p.slice(0, 26), r: fmtEuro(q) }))] }))}
                    centro={<><span className="text-xl font-black text-white tabular-nums leading-none"><Num v={venduto} euro /></span><span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">venduto · {fmtN(pezzi)} pz</span></>} />
                <div className="space-y-1 pt-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Categorie</p>
                    {perCat.slice(0, 7).map(([c, v], i) => (
                        <div key={c} className="flex items-center gap-2 text-[11px]">
                            <span className="w-2 h-2 rounded-full" style={{ background: COLORI[i % COLORI.length] }} />
                            <span className="text-slate-300">{icona(c)} {c}</span>
                            <b className="text-white tabular-nums ml-auto pl-3">{fmtEuro(v.val)}</b>
                            <span className="text-[10px] text-slate-500 tabular-nums">{fmtN(v.qty)} pz</span>
                        </div>
                    ))}
                    {ctx.confronto && <p className="pt-1"><Delta v={venduto - vendutoPrev} euro /> <span className="text-[10px] text-slate-500">venduto vs mese scorso</span></p>}
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Top prodotti (per venduto)</p>
                <RaceBars unit="€" righe={topProdotti.map(([p, v], i) => ({ k: p, label: p, val: Math.round(v.val), colore: COLORI[i % COLORI.length], det: [{ l: "venduto", r: fmtEuro(v.val) }, { l: "pezzi", r: fmtN(v.qty) }, { l: "categoria", r: catDi(p) }] }))} />
                {size >= 4 && <div className="mt-3"><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Ritmo del mese (€ venduti)</p><HeatCal giorni={perGiorno} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} colore="#22c55e" unit="€ venduti" /></div>}
                <p className="mt-2 text-[10px] text-slate-600">valore VENDUTO · nella sezione a valore arriverà l'UTILE: pagato dei contratti + ricavo marginalità al netto di IVA e costi</p>
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
                    <LogoBrand chiave={GARA[b].chiave} colore={GARA[b].colore} alt={GARA[b].label} h={22} />
                    <span className="flex-1" />
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
                    <LogoBrand chiave={GARA[t.b].chiave} colore={GARA[t.b].colore} alt={GARA[t.b].label} h={22} />
                    <p className="text-xs text-amber-100 flex-1"><b className="tabular-nums">{fmtPt(t.gap)} pt</b> per superare {t.k}</p>
                    <span className="text-lg">🎯</span>
                </div>
            ))}
        </div>
    );
}

// PESO NEI NEGOZI (idea Luca 21/08): un contatore PER OGNI BRAND che il
// negozio attiva — gare (W3/VF/FW/Sky) + Marginalità (in € venduti) + gli
// altri operatori (S4, TIM…) a pezzi. Hover = dettaglio categorie nel brand.
function AnelloPeso({ perc, colore, label, logoChiave, tip }) {
    return (
        <Tip tip={tip}>
            <div className="text-center">
                <div className="relative w-[76px] h-[76px] mx-auto grid place-items-center rounded-full transition-transform hover:scale-110" style={{ background: `conic-gradient(${colore} ${Math.min(360, perc * 3.6)}deg, rgba(255,255,255,.07) 0deg)`, boxShadow: `0 0 12px ${colore}33` }}>
                    <div className="w-[58px] h-[58px] rounded-full bg-[#10132a] grid place-items-center">
                        <span className="text-sm font-black text-white tabular-nums">{Math.round(perc)}%</span>
                    </div>
                </div>
                <div className="mt-1 flex justify-center">
                    {logoChiave ? <LogoBrand chiave={logoChiave} alt={label} h={17} />
                        : <p className="text-[10px] text-slate-400 font-semibold max-w-[86px] truncate">{label}</p>}
                </div>
            </div>
        </Tip>
    );
}

function WidgetPesoNegozi({ ctx }) {
    const mio = (arr, campo = "venditore") => arr.filter((x) => norm(x[campo]) === norm(ctx.persona));
    const negozi = useMemo(() => {
        const per = new Map();
        for (const it of [...mio(ctx.itemsRete), ...mio(ctx.altriRete || []), ...mio(ctx.extRete || [])]) per.set(it.negozio, (per.get(it.negozio) || 0) + 1);
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [ctx.itemsRete, ctx.altriRete, ctx.extRete, ctx.persona]);
    if (!negozi.length) return <p className="text-xs text-slate-500 py-4 text-center">Nessuna vendita nel periodo.</p>;

    const contatoriDi = (n) => {
        const out = [];
        // brand di gara: quota sui pezzi, categorie (con punti) nel tooltip
        for (const b of ["w3", "vf", "sky", "fw"]) {
            const store = ctx.itemsRete.filter((it) => it.negozio === n && it.brandGara === b);
            if (!store.length) continue;
            const miei = mio(store);
            const righe = righeOperatore(b, miei);
            out.push({
                label: GARA[b].label, logoChiave: GARA[b].chiave, colore: GARA[b].colore, perc: (miei.length / store.length) * 100,
                tip: <div><TipTitolo>{GARA[b].label} · {n}</TipTitolo>
                    <TipRiga l="tuoi pezzi" r={`${fmtN(miei.length)}/${fmtN(store.length)}`} colore={GARA[b].colore} />
                    {b !== "fw" && <TipRiga l="tuoi punti" r={`${fmtPt(somma(miei))}/${fmtPt(somma(store))}`} />}
                    {righe.map((r) => <TipRiga key={r.label} l={`${r.emoji} ${r.label}`} r={b === "fw" ? `${fmtN(r.items.length)} pz` : `${fmtN(r.items.length)} pz · ${fmtPt(somma(r.items))} pt`} colore={r.colore} />)}
                </div>,
            });
        }
        // Marginalità: quota sul VENDUTO (€), categorie in €
        const storeExt = (ctx.extRete || []).filter((r) => r.negozio === n);
        if (storeExt.length) {
            const mieiExt = mio(storeExt);
            const val = (arr) => arr.reduce((s, r) => s + (Number(r.prezzo) || 0), 0);
            const catDi = (p) => ctx.margMap?.get(norm(p))?.cat || (/bundle/i.test(String(p || "")) ? "Bundle" : /(telefono|tnp|smartphone|iphone)/i.test(String(p || "")) ? "Telefoni" : "Altro");
            const perCat = {};
            for (const r of mieiExt) perCat[catDi(r.prodotto)] = (perCat[catDi(r.prodotto)] || 0) + (Number(r.prezzo) || 0);
            out.push({
                label: "Marginalità", logoChiave: "marginalita", colore: "#22c55e", perc: val(storeExt) > 0 ? (val(mieiExt) / val(storeExt)) * 100 : 0,
                tip: <div><TipTitolo>💰 Marginalità · {n}</TipTitolo>
                    <TipRiga l="tuo venduto" r={`${fmtEuro(val(mieiExt))} / ${fmtEuro(val(storeExt))}`} colore="#22c55e" />
                    {Object.entries(perCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => <TipRiga key={c} l={c} r={fmtEuro(v)} />)}
                </div>,
            });
        }
        // altri operatori (S4, TIM, Iliad…): quota sui pezzi, categorie a pezzi
        const altStore = (ctx.altriRete || []).filter((it) => it.negozio === n);
        const perBrand = {};
        for (const it of altStore) (perBrand[it.brand] ??= []).push(it);
        for (const [brand, store] of Object.entries(perBrand).sort((a, b) => b[1].length - a[1].length)) {
            const miei = mio(store);
            const colore = TRK_BRAND_COLORS[trkBrandKey(brand)] || "#64748b";
            const perCat = {};
            for (const it of miei) perCat[it.categoria || "Altro"] = (perCat[it.categoria || "Altro"] || 0) + 1;
            out.push({
                label: brand, logoChiave: TRK_BRAND_LOGOS[trkBrandKey(brand)] ? trkBrandKey(brand) : null, colore, perc: (miei.length / store.length) * 100,
                tip: <div><TipTitolo>{brand} · {n}</TipTitolo>
                    <TipRiga l="tuoi pezzi" r={`${fmtN(miei.length)}/${fmtN(store.length)}`} colore={colore} />
                    {Object.entries(perCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => <TipRiga key={c} l={c} r={fmtN(v)} />)}
                </div>,
            });
        }
        return out;
    };

    return (
        <div className="space-y-4">
            {negozi.slice(0, 3).map((n) => (
                <div key={n}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">🏪 {n}</p>
                    <div className="flex flex-wrap gap-3 justify-around">
                        {contatoriDi(n).map((c) => <AnelloPeso key={c.label} {...c} />)}
                    </div>
                </div>
            ))}
            <p className="text-[10px] text-slate-500 text-center">la tua quota su ogni brand che il negozio attiva · Marginalità in € venduti{negozi.length > 1 ? " · presidi più negozi 💪" : ""}</p>
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
                            <div className="mb-0.5"><LogoBrand chiave={GARA[b].chiave} colore={GARA[b].colore} alt={GARA[b].label} h={18} /></div>
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

// PRODUZIONE GIORNALIERA (Luca 21/08: niente cumulati «sempre in crescita»):
// barre del giorno impilate per CATEGORIA (stessi colori della carta
// operatore), linea della media, oggi col tratto che manca alla media come
// proiezione del giorno. Nel tooltip il dettaglio PRECISO di cosa è stato
// venduto (offerte/prodotti); pulsante che switcha PUNTI ↔ PEZZI.
function WidgetMese({ ctx, brand }) {
    const puoPunti = brand !== "pezzi" && brand !== "fw";
    const [metrica, setMetrica] = useState(puoPunti ? "punti" : "pezzi");
    const aPezzi = metrica === "pezzi";
    const unit = aPezzi ? "pz" : "pt";
    const giorni = useMemo(() => {
        const filtrati = brand === "pezzi" ? ctx.items : ctx.items.filter((it) => it.brandGara === brand);
        const rigaDi = new Map();
        if (brand !== "pezzi") for (const r of righeOperatore(brand, filtrati)) for (const it of r.items) rigaDi.set(it, r);
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, tot: 0, _p: new Map() }));
        for (const it of filtrati) {
            if (it.g < 1 || it.g > ctx.nG) continue;
            const val = aPezzi ? 1 : it.punti;
            const r = brand === "pezzi"
                ? { label: GARA[it.brandGara].label, colore: GARA[it.brandGara].colore }
                : (rigaDi.get(it) ? { label: `${rigaDi.get(it).emoji} ${rigaDi.get(it).label}`, colore: rigaDi.get(it).colore } : { label: "➕ Altro", colore: "#64748b" });
            const g = v[it.g - 1];
            const e = g._p.get(r.label) || { label: r.label, colore: r.colore, val: 0, pz: 0, prod: new Map() };
            e.val += val; e.pz++;
            const nomeVend = String(it.offerta || it.prodotto || "—").slice(0, 30);
            e.prod.set(nomeVend, (e.prod.get(nomeVend) || 0) + 1);
            g._p.set(r.label, e); g.tot += val;
        }
        return v.map((g) => ({
            n: g.n, label: g.label, tot: Math.round(g.tot * 100) / 100,
            parti: [...g._p.values()].sort((a, b) => b.val - a.val).map((p) => {
                const top = [...p.prod.entries()].sort((a, b) => b[1] - a[1]);
                const prodotti = top.slice(0, 4).map(([nm, q]) => `${q}× ${nm}`).join(" · ") + (top.length > 4 ? ` · +${top.length - 4} altri` : "");
                return { label: p.label, colore: p.colore, val: Math.round(p.val * 100) / 100, sub: `${fmtN(p.pz)} pz`, prodotti };
            }),
        }));
    }, [ctx.items, ctx.nG, ctx.labels, brand, aPezzi]);
    const totale = giorni.reduce((s, g) => s + g.tot, 0);
    const gLav = ctx.meseCorrente ? Math.max(1, ctx.gl?.trascorsi || 1) : (ctx.gl?.totali || ctx.nG);
    const media = totale > 0 ? Math.round((totale / gLav) * 100) / 100 : null;
    return (
        <div>
            {puoPunti && (
                <div className="flex justify-end -mt-1 mb-1">
                    <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/10">
                        {[["punti", "pt"], ["pezzi", "pz"]].map(([m, l]) => (
                            <button key={m} onClick={() => setMetrica(m)} className={cn("px-2 py-0.5 rounded-md text-[10px] font-black transition-all", metrica === m ? "bg-indigo-500/80 text-white" : "text-slate-500 hover:text-white")}>{l}</button>
                        ))}
                    </div>
                </div>
            )}
            <BarStack giorni={giorni} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} media={media} unit={unit} h={180} />
            <p className="mt-1.5 text-[10px] text-slate-500">{brand === "pezzi" ? "pezzi del giorno, impilati per operatore" : `${aPezzi ? "pezzi" : "punti"} ${GARA[brand].label} del giorno, per categoria`} · tratteggio = media/giorno · passa il mouse: dentro c'è cosa hai venduto, voce per voce</p>
        </div>
    );
}

function WidgetRitmo({ ctx }) {
    const giorni = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, val: 0, det: [] }));
        const perB = {};
        for (const it of ctx.items) { if (it.g < 1 || it.g > ctx.nG) continue; v[it.g - 1].val++; (perB[it.g] ??= {}); perB[it.g][it.brandGara] = (perB[it.g][it.brandGara] || 0) + 1; }
        v.forEach((d) => { d.det = Object.entries(perB[d.n] || {}).map(([k, n]) => ({ l: GARA[k].label, r: `${fmtN(n)} pz`, colore: GARA[k].colore })); });
        return v;
    }, [ctx.items, ctx.nG, ctx.labels]);
    return <HeatCal giorni={giorni} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} colore="var(--tf-818cf8)" unit="pezzi" />;
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
    "op:w3": { nome: "WindTre", emoji: "🟠", gruppo: "operatori", def: 2, solo: null, senzaTitolo: true, render: (ctx, size) => <CartaOperatore brand="w3" ctx={ctx} size={size} /> },
    "op:vf": { nome: "Vodafone", emoji: "🔴", gruppo: "operatori", def: 2, senzaTitolo: true, render: (ctx, size) => <CartaOperatore brand="vf" ctx={ctx} size={size} /> },
    "op:sky": { nome: "Sky", emoji: "🟣", gruppo: "operatori", def: 2, senzaTitolo: true, render: (ctx, size) => <CartaOperatore brand="sky" ctx={ctx} size={size} /> },
    "op:fw": { nome: "Fastweb T2", emoji: "🟡", gruppo: "operatori", def: 2, senzaTitolo: true, render: (ctx, size) => <CartaOperatore brand="fw" ctx={ctx} size={size} /> },
    "marg": { nome: "Marginalità · venduto", emoji: "💰", gruppo: "marginalità", def: 4, logoChiave: "marginalita", nomeBreve: "", render: (ctx, size) => <WidgetMarg ctx={ctx} size={size} /> },
    "posizioni": { nome: "Posizioni per operatore", emoji: "🏅", gruppo: "obiettivi", def: 1, solo: "io", render: (ctx) => <WidgetPosizioni ctx={ctx} /> },
    "bersaglio": { nome: "Bersagli da superare", emoji: "🎯", gruppo: "obiettivi", def: 1, solo: "io", render: (ctx) => <WidgetBersaglio ctx={ctx} /> },
    "pesonegozi": { nome: "Il mio peso nei negozi", emoji: "⚖️", gruppo: "obiettivi", def: 2, solo: "io", render: (ctx) => <WidgetPesoNegozi ctx={ctx} /> },
    "squadra:pezzi": { nome: "Squadra — per pezzi", emoji: "🏆", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="pezzi" /> },
    "squadra:w3": { nome: "Squadra — punti WindTre", emoji: "🏆", nomeBreve: "Squadra", logoChiave: "windtre", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="w3" /> },
    "squadra:vf": { nome: "Squadra — punti Vodafone", emoji: "🏆", nomeBreve: "Squadra", logoChiave: "vodafone", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="vf" /> },
    "squadra:sky": { nome: "Squadra — punti Sky", emoji: "🏆", nomeBreve: "Squadra", logoChiave: "sky", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="sky" /> },
    "duello": { nome: "Duello tra negozi", emoji: "⚔️", gruppo: "squadra", def: 1, solo: "negozio", render: (ctx) => <WidgetDuello ctx={ctx} /> },
    "mese:pezzi": { nome: "Giorno per giorno — pezzi", emoji: "📊", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="pezzi" /> },
    "mese:w3": { nome: "Giorno per giorno — WindTre", emoji: "📊", nomeBreve: "Giorno per giorno", logoChiave: "windtre", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="w3" /> },
    "mese:vf": { nome: "Giorno per giorno — Vodafone", emoji: "📊", nomeBreve: "Giorno per giorno", logoChiave: "vodafone", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="vf" /> },
    "mese:sky": { nome: "Giorno per giorno — Sky", emoji: "📊", nomeBreve: "Giorno per giorno", logoChiave: "sky", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMese ctx={ctx} brand="sky" /> },
    "ritmo": { nome: "Ritmo del mese", emoji: "🗓", gruppo: "andamento", def: 1, render: (ctx) => <WidgetRitmo ctx={ctx} /> },
    "mix:pezzi": { nome: "Mix operatori (pezzi)", emoji: "🧬", gruppo: "andamento", def: 1, render: (ctx) => <WidgetMixPezzi ctx={ctx} /> },
};
export const GRUPPI = ["operatori", "marginalità", "squadra", "obiettivi", "andamento"];
export const DEFAULT_LAYOUT = {
    io: ["op:w3@2", "op:vf@2", "op:sky@2", "op:fw@2", "posizioni@1", "bersaglio@1", "pesonegozi@2", "marg@4", "mese:pezzi@2", "mix:pezzi@1", "ritmo@1"],
    negozio: ["op:w3@2", "op:vf@2", "op:sky@2", "op:fw@2", "squadra:pezzi@2", "duello@1", "mix:pezzi@1", "marg@4", "mese:pezzi@2", "ritmo@1", "squadra:w3@2"],
};
