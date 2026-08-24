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

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TRK_BRAND_LOGOS, TRK_LOGO_SCALE, trkBrandKey } from "@/lib/brandAssets";
import { SelectOpzioni } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { Num, Tip, TipRiga, TipTitolo, BarStack, RaceBars, HeatCal, Donut, Delta, fmtPt, fmtN, fmtEuro } from "./_charts";

const norm = (s) => String(s || "").trim().toLowerCase();
// COLORI in HEX PIENO, mai var(--…): nei grafici si concatena l'alpha
// (`${colore}55`) e con una var CSS il valore diventa invalido → riempimenti
// TRASPARENTI (bug delle barre del Master, visto da Luca 21/08 notte).
export const HEX_BRAND = {
    windtre: "#f97316", vodafone: "#e60000", fastweb: "#eab308", sky: "#8b5cf6",
    s4: "#22c55e", tim: "#0050ff", iliad: "#c00028", dojo: "#14b8a6",
    verymobile: "#84cc16", homobile: "#9b26b6", kenamobile: "#e4002b", marginalita: "#06b6d4",
};
export const GARA = {
    w3: { label: "WindTre", chiave: "windtre", colore: HEX_BRAND.windtre, logo: TRK_BRAND_LOGOS.windtre },
    vf: { label: "Vodafone", chiave: "vodafone", colore: HEX_BRAND.vodafone, logo: TRK_BRAND_LOGOS.vodafone },
    fw: { label: "Fastweb", chiave: "fastweb", colore: HEX_BRAND.fastweb, logo: TRK_BRAND_LOGOS.fastweb },
    sky: { label: "Sky", chiave: "sky", colore: HEX_BRAND.sky, logo: TRK_BRAND_LOGOS.sky },
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

export function righeOperatore(brand, sue) {
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

/* ═══ DRILL-DOWN: dal numero alla LISTA DEI CONTRATTI (Luca 21/08) ═════
   «devo poter arrivare alla lista dei singoli contratti»: ogni riga porta
   data, negozio, venditore, codice, prodotto/offerta, punti e i link diretti
   🔍 Ricerca Vendite (?id=) e 🧭 Tracking PDA (?id=). Ricerca interna. */
export function DrillPanel({ drill, chiudi, labels }) {
    const [q, setQ] = useState("");
    const [copiato, setCopiato] = useState(false);
    // Esc chiude (revisione 21/08)
    useEffect(() => {
        if (!drill) return;
        const giu = (e) => { if (e.key === "Escape") chiudi(); };
        window.addEventListener("keydown", giu);
        return () => window.removeEventListener("keydown", giu);
    }, [drill, chiudi]);
    if (!drill || typeof document === "undefined") return null;
    const nq = norm(q);
    const filtrati = (drill.items || []).filter((it) => !nq || [it.venditore, it.negozio, it.cod_ins, it.prodotto, it.offerta, it.categoria, it.id].some((v) => norm(v).includes(nq)))
        .slice().sort((a, b) => b.g - a.g);
    const punti = Math.round(filtrati.reduce((s, it) => s + (it.punti || 0), 0) * 100) / 100;
    // PORTALE sul body: dentro le card l'hover-transform (translate-y) le rende
    // containing block dei fixed e il pannello restava CONFINATO nella card
    return createPortal(
        <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm grid place-items-center p-3 sm:p-6" onClick={chiudi}>
            <div className="glass-card rounded-2xl w-full max-w-3xl max-h-[84vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 pb-3 border-b border-white/10">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-white truncate">{drill.titolo}</p>
                        <button onClick={chiudi} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 shrink-0">✕</button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-bold text-slate-200 tabular-nums">{fmtN(filtrati.length)} contratti</span>
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-bold text-slate-200 tabular-nums">{fmtPt(punti)} pt</span>
                        {drill.sub && <span className="text-[10px] text-slate-500">{drill.sub}</span>}
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cerca: venditore, negozio, codice, offerta…"
                            className="glass-input ml-auto px-2.5 py-1.5 rounded-lg text-xs min-w-[220px]" />
                        <button onClick={() => {
                            const testo = [drill.titolo, ...filtrati.map((it) => `${labels?.[it.g - 1] || ""} · ${it.venditore} · ${it.negozio} · ${it.offerta || it.prodotto} · ${fmtPt(it.punti)} pt`)].join("\n");
                            navigator.clipboard?.writeText(testo).then(() => { setCopiato(true); setTimeout(() => setCopiato(false), 1500); });
                        }} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 hover:bg-white/10">{copiato ? "✓ copiato" : "📋 copia"}</button>
                    </div>
                </div>
                <div className="overflow-y-auto p-2">
                    {filtrati.map((it) => (
                        <div key={it.id} className="grid grid-cols-[52px_minmax(0,1.5fr)_minmax(0,2fr)_auto_auto] items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                            <span className="text-[10px] text-slate-500 tabular-nums">{labels?.[it.g - 1] || `g.${it.g}`}</span>
                            <span className="min-w-0">
                                <span className="block text-[11px] font-semibold text-slate-200 truncate">{it.venditore}</span>
                                <span className="block text-[10px] text-slate-500 truncate">🏪 {it.negozio} · 🎯 {it.cod_ins}</span>
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[11px] text-slate-300 truncate">{it.offerta || it.prodotto}</span>
                                <span className="block text-[10px] text-slate-500 truncate">{it.categoria}{it.offerta && it.prodotto ? ` · ${it.prodotto}` : ""}</span>
                            </span>
                            <span className="text-right">
                                <span className="block text-[11px] font-black text-white tabular-nums">{fmtPt(it.punti)} pt</span>
                                {it.senzaRiga && <span className="text-[9px] text-amber-300">⚠ senza punti</span>}
                                {it.esclusa && <span className="text-[9px] text-rose-300">🚫 esclusa</span>}
                                {it.fwInA && <span className="text-[9px] text-yellow-200">🟨 lettera A</span>}
                            </span>
                            <span className="flex gap-1">
                                <a href={`/ricerca-vendite?id=${encodeURIComponent(it.id)}`} title="Apri in Ricerca Vendite" className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[12px]">🔍</a>
                                <a href={`/pda/tracking?id=${encodeURIComponent(it.id)}`} title="Apri nel Tracking PDA" className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[12px]">🧭</a>
                            </span>
                        </div>
                    ))}
                    {!filtrati.length && <p className="text-xs text-slate-500 text-center py-8">Nessun contratto{q ? " per questa ricerca" : ""}.</p>}
                </div>
            </div>
        </div>, document.body
    );
}

/* ═══ TIMELINE DI PRODUZIONE NELL'HEADER (Luca 24/08): la produzione giorno
   per giorno — TUTTA, impilata per operatore — integrata nell'hero di Io e
   Negozio, con i brand piccolini cliccabili che filtrano lo schema. Stessa
   interattività del widget (tooltip con le vendite voce per voce, media,
   giorno di oggi evidenziato). ═══════════════════════════════════════════ */
export function TimelineHero({ ctx, tecnico = false }) {
    // RIPENSAMENTO Luca 24/08: la Marginalità sta nella timeline SOLO per i
    // TECNICI (è il loro mondo) e in FATTURATO €; per tutti gli altri, fuori.
    // `tecnico` = ruolo della PERSONA OSSERVATA (o del collaboratore
    // filtrato), calcolato dalla pagina — non di chi sta guardando.
    // TUTTA la produzione della persona/negozio (Luca 24/08): i 4 brand in
    // gara + la MARGINALITÀ (vendite EXT, a pezzi) + gli ALTRI operatori
    // (S4, TIM, Very…). Ogni serie ha logo e colore; le pill sotto (solo
    // loghi) accendono e spengono la serie.
    const serie = useMemo(() => {
        const out = new Map();
        const add = (key, label, colore, chiave, g, nome, pezzi = 1) => {
            if (g < 1 || g > ctx.nG) return;
            const sr = out.get(key) || { key, label, colore, chiave, tot: 0, giorni: new Map() };
            const gg = sr.giorni.get(g) || { val: 0, prod: new Map() };
            gg.val += pezzi; sr.tot += pezzi;
            const nm = String(nome || "—").slice(0, 30);
            gg.prod.set(nm, (gg.prod.get(nm) || 0) + pezzi);
            sr.giorni.set(g, gg);
            out.set(key, sr);
        };
        if (tecnico) {
            // il tecnico vede la SUA produzione: la marginalità in FATTURATO
            for (const r of (ctx.ext || [])) add("marg", "Marginalità", HEX_BRAND.marginalita || "#06b6d4", "marginalita", r.g, r.prodotto, Number(r.prezzo) || 0);
        } else {
            for (const it of ctx.items) {
                const G = GARA[it.brandGara];
                if (G) add(it.brandGara, G.label, G.colore, G.chiave, it.g, it.offerta || it.prodotto);
            }
            for (const r of (ctx.altri || [])) {
                const k = trkBrandKey(r.brand);
                if (!k) continue;
                add(`alt:${k}`, r.brand, HEX_BRAND[k] || "#64748b", k, r.g, r.offerta || r.prodotto);
            }
        }
        const ordine = ["w3", "vf", "fw", "sky", "marg"];
        return [...out.values()].sort((a, b) => {
            const ia = ordine.indexOf(a.key), ib = ordine.indexOf(b.key);
            if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            return b.tot - a.tot;
        });
    }, [ctx.items, ctx.ext, ctx.altri, ctx.nG, tecnico]);
    const [spenti, setSpenti] = useState(() => new Set());
    const toggle = (k) => setSpenti((prev) => {
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });
    const giorni = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, tot: 0, parti: [] }));
        for (const sr of serie) {
            if (spenti.has(sr.key)) continue;
            for (const [g, gg] of sr.giorni) {
                const top = [...gg.prod.entries()].sort((a, b) => b[1] - a[1]);
                const prodotti = top.slice(0, 4).map(([nm, q]) => (tecnico ? `${fmtN(q)} € · ${nm}` : `${q}× ${nm}`)).join(" · ") + (top.length > 4 ? ` · +${top.length - 4} altri` : "");
                v[g - 1].parti.push({ label: sr.label, colore: sr.colore, val: Math.round(gg.val * 100) / 100, prodotti });
                v[g - 1].tot += gg.val;
            }
        }
        for (const g of v) g.parti.sort((a, b) => b.val - a.val);
        return v;
    }, [serie, spenti, ctx.nG, ctx.labels, tecnico]);
    const totale = giorni.reduce((sm, g) => sm + g.tot, 0);
    const media = totale > 0 ? Math.round((totale / Math.max(1, ctx.gLav || 1)) * 100) / 100 : null;
    if (!serie.length) return null;
    return (
        <div className="relative mt-3">
            <BarStack giorni={giorni} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} media={media} unit={tecnico ? "€" : "pz"} h={92} />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
                {serie.map((sr) => {
                    const off = spenti.has(sr.key);
                    return (
                        <button key={sr.key} onClick={() => toggle(sr.key)}
                            title={`${off ? "Rimetti" : "Togli"} ${sr.label} ${off ? "nella" : "dalla"} timeline · ${fmtN(sr.tot)} ${tecnico ? "€" : "pz"} nel periodo`}
                            className={cn("flex items-center px-2.5 py-1.5 rounded-lg border transition-all", off ? "border-white/10 bg-white/[0.02] opacity-35 grayscale" : "border-white/10 bg-white/[0.05] hover:bg-white/[0.09]")}>
                            <LogoBrand chiave={sr.chiave} h={15} />
                        </button>
                    );
                })}
                <span className="text-[10px] text-slate-500 ml-1">{tecnico ? "fatturato marginalità giorno per giorno" : "produzione giorno per giorno · tutta · click sui loghi per filtrare"}</span>
            </div>
        </div>
    );
}

/* ═══ CONTATORI PER PISTA (Luca 24/08): su Wind3/Vodafone/Fastweb le piste
   sono GARE DIVERSE — niente totalone: un piccolo contatore per ognuna, con
   la SORGENTE dei punti scomposta dentro (SIM, finanziamenti, business…).
   Sky resta con l'anello unico: lì è una sola gara che somma tutto. ═══════ */
function contatoriPiste(brand, sue, prev) {
    const S = (arr) => somma(arr);
    const biz = (it) => /business/i.test(String(it.tipo || ""));
    const telefono = (it) => /^telefono a rate/i.test(String(it.categoria || ""));
    const opCb = (it) => /^customer base/i.test(String(it.categoria || ""));
    const assic = (it) => /assicurazion/i.test(String(it.prodotto || "") + " " + String(it.categoria || ""));
    const gasDi = (it) => /gas/i.test(String(it.prodotto || ""));
    const pista = (arr, p) => arr.filter((it) => it.pista === p);
    const catMob = (it) => /^mobile/i.test(String(it.categoria || ""));
    const catFis = (it) => /^fisso/i.test(String(it.categoria || ""));
    const catEn = (it) => /^energia/i.test(String(it.categoria || ""));
    const out = [];
    // sorgenti: {l, v, u, items} — u "pt" o "pz"; righe a 0 non si mostrano;
    // gli items della sorgente alimentano l'ANALISI ESPLOSA (📊, Luca 24/08)
    const add = (chiave, label, emoji, unit, items, prevItems, sorgenti = [], nota = null) => {
        if (!items.length && !(prevItems || []).length) return;
        out.push({
            chiave, label, emoji, unit, items,
            val: unit === "pt" ? S(items) : items.length,
            prevVal: unit === "pt" ? S(prevItems || []) : (prevItems || []).length,
            sorgenti: sorgenti.filter((s) => s.v > 0), nota,
        });
    };
    if (brand === "w3") {
        const mob = pista(sue, "mobile"), mobP = pista(prev, "mobile");
        // partizione PULITA (Σ sorgenti = totale pista): SIM consumer /
        // telefoni finanziati (tutti) / SIM business
        const srg = (l, arr, u = "pt") => ({ l, v: u === "pt" ? S(arr) : arr.length, u, items: arr });
        add("mobile", "Mobile", "📶", "pt", mob, mobP, [
            srg("SIM", mob.filter((it) => !biz(it) && !telefono(it))),
            srg("finanziamenti", mob.filter(telefono)),
            srg("business", mob.filter((it) => biz(it) && !telefono(it))),
        ]);
        const fis = pista(sue, "fisso"), fisP = pista(prev, "fisso");
        add("fisso", "Fisso", "🌐", "pt", fis, fisP, [
            srg("consumer", fis.filter((it) => !biz(it))),
            srg("business", fis.filter(biz)),
        ]);
        const cb = pista(sue, "cb"), cbP = pista(prev, "cb");
        add("cb", "Customer Base", "🔁", "pt", cb, cbP, [
            srg("operazioni SIM", cb.filter(opCb)),
            srg("telefoni CB", cb.filter(telefono)),
        ]);
        const lg = pista(sue, "lucegas"), lgP = pista(prev, "lucegas");
        add("lucegas", "Luce & Gas", "⚡", "pt", lg, lgP, [
            srg("luce", lg.filter((it) => !gasDi(it))),
            srg("gas", lg.filter(gasDi)),
        ]);
        const ass = sue.filter(assic), assP = prev.filter(assic);
        add("assic", "Assicurazioni", "🛡", "pt", ass, assP, [],
            `${ass.length} pezzi · verso i target di gruppo`);
        const bz = sue.filter(biz), bzP = prev.filter(biz);
        add("business", "Business", "💼", "pz", bz, bzP, [
            srg("mobile", bz.filter(catMob), "pz"),
            srg("fisso", bz.filter(catFis), "pz"),
            srg("altro", bz.filter((it) => !catMob(it) && !catFis(it)), "pz"),
        ], "eventi · i punti sono dentro Mobile e Fisso");
    } else if (brand === "vf") {
        const srg = (l, arr, u = "pt") => ({ l, v: u === "pt" ? S(arr) : arr.length, u, items: arr });
        const mob = pista(sue, "mobile"), mobP = pista(prev, "mobile");
        add("mobile", "Mobile", "📶", "pt", mob, mobP, [
            srg("SIM", mob.filter((it) => !telefono(it))),
            srg("telefoni", mob.filter(telefono)),
        ]);
        const fis = pista(sue, "fisso"), fisP = pista(prev, "fisso");
        // partizione vera (rilievo revisore): native VF + FW lettera A
        add("fisso", "Fisso", "🌐", "pt", fis, fisP, [
            srg("Vodafone", fis.filter((it) => !it.fwInA)),
            srg("FW lettera A", fis.filter((it) => it.fwInA)),
        ]);
        const lg = pista(sue, "lucegas"), lgP = pista(prev, "lucegas");
        add("lucegas", "Luce & Gas", "⚡", "pt", lg, lgP, [
            srg("luce", lg.filter((it) => !gasDi(it))),
            srg("gas", lg.filter(gasDi)),
        ]);
        const bm = pista(sue, "business_mobile"), bf = pista(sue, "business_fisso");
        const bmP = pista(prev, "business_mobile"), bfP = pista(prev, "business_fisso");
        add("business", "Business", "💼", "pz", [...bm, ...bf], [...bmP, ...bfP], [
            srg("biz mobile", bm),
            srg("biz fisso", bf),
        ], "piste business della lettera");
    } else if (brand === "fw") {
        // mobile = SIM + telefoni, allineato alla riga Mobile delle categorie
        // sotto (rilievo del revisore: i due numeri non devono divergere)
        const eMob = (it) => catMob(it) || telefono(it);
        const mob = sue.filter(eMob), mobP = prev.filter(eMob);
        add("mobile", "Mobile", "📶", "pz", mob, mobP);
        const fis = sue.filter(catFis), fisP = prev.filter(catFis);
        add("fisso", "Fisso", "🌐", "pz", fis, fisP);
        const en = sue.filter(catEn), enP = prev.filter(catEn);
        const srg = (l, arr) => ({ l, v: arr.length, u: "pz", items: arr });
        add("energia", "Energia", "⚡", "pz", en, enP, [
            srg("luce", en.filter((it) => !gasDi(it))),
            srg("gas", en.filter(gasDi)),
        ]);
        const resto = sue.filter((it) => !eMob(it) && !catFis(it) && !catEn(it));
        const restoP = prev.filter((it) => !eMob(it) && !catFis(it) && !catEn(it));
        add("altro", "Altro", "📦", "pz", resto, restoP);
    }
    return out;
}

/* ═══ ANALISI ESPLOSA DELLA PISTA (📊, Luca 24/08: «una finestra che si
   apre con effetto scenico bellissimo») ═══════════════════════════════════
   Fuori si vedono le macro-sorgenti (SIM/telefoni, FWA/fisso…); qui dentro
   ogni sorgente ESPLODE per sottogruppo — Ric. Automatica, MNP, Wallet,
   FWA vs fisso, rateali vs finanziati — e ogni sottogruppo è una torta con
   lo spaccato dei punti PER OFFERTA (Dolce Vita Pro, Start MNP…), fino al
   drill dei contratti. Tutto data-driven dagli items della pista. */
function gruppoAnalisiDi(ct, it) {
    const cat = String(it.categoria || ""), prod = String(it.prodotto || ""), off = String(it.offerta || "");
    if (ct.chiave === "fisso") return /fwa|super internet/i.test(prod + " " + off) ? "📡 FWA" : "🌐 Fisso";
    if (/^telefono a rate/i.test(cat)) return /^finanziato/i.test(prod) ? "🏦 Finanziati" : "💳 Rateali";
    if (/^mobile/i.test(cat)) {
        const sub = cat.replace(/^mobile\s*/i, "").trim();
        return sub ? `📶 ${sub}` : "📶 SIM";
    }
    if (/^energia/i.test(cat)) return /gas/i.test(prod) ? "🔥 Gas" : "💡 Luce";
    if (/^customer base/i.test(cat)) return "🔁 " + (prod || "Operazioni");
    return cat || "Altro";
}

function AnalisiPistaPanel({ G, ct, ctx, chiudi, apriDrill, drillAperto = false }) {
    const [on, setOn] = useState(false);
    const [tab, setTab] = useState(0);
    useEffect(() => { const t = setTimeout(() => setOn(true), 40); return () => clearTimeout(t); }, []);
    useEffect(() => {
        // col DRILL aperto sopra, Esc chiude solo quello (rilievo revisore)
        const h = (e) => { if (e.key === "Escape" && !drillAperto) chiudi(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [chiudi, drillAperto]);
    const tabs = ct.sorgenti.length ? ct.sorgenti : [{ l: ct.label, v: ct.val, u: ct.unit, items: ct.items }];
    const att = tabs[Math.min(tab, tabs.length - 1)];
    const aPunti = (att.u || ct.unit) === "pt";
    // sottogruppi della sorgente attiva → dentro ognuno lo spaccato per offerta
    const gruppi = useMemo(() => {
        const m = new Map();
        for (const it of (att.items || [])) {
            const g = gruppoAnalisiDi(ct, it);
            (m.get(g) || m.set(g, []).get(g)).push(it);
        }
        return [...m.entries()]
            .map(([nome, items]) => ({ nome, items, val: aPunti ? somma(items) : items.length }))
            .sort((a, b) => b.val - a.val);
    }, [att, ct, aPunti]);
    const TONI = ["#818cf8", "#22c55e", "#f59e0b", "#e879f9", "#14b8a6", "#f97316", "#38bdf8", "#a3e635", "#f43f5e", "#64748b"];
    // COLORE STABILE PER FAMIGLIA DI OFFERTA (Luca 24/08: «Pro ric auto e Pro
    // wallet con due colori diversi rischiano di confondere»): la chiave
    // colore è il nome offerta SENZA i marcatori di variante (Wallet, Ric.
    // Automatica) e senza prezzi — così "Pro" è dello stesso colore in TUTTE
    // le torte e in tutti i tab del pannello.
    const famigliaOfferta = (off) => String(off || "—")
        .replace(/\b(wallet|ric\.?\s*aut\w*|ricarica\s*automatica)\b/gi, "")
        .replace(/\b\d+[.,]?\d*\b/g, "")
        .replace(/\s+/g, " ").trim().toLowerCase() || "—";
    const coloreFamiglia = useMemo(() => {
        const tot = new Map();
        for (const it of (ct.items || [])) {
            const f = famigliaOfferta(it.offerta || it.prodotto);
            tot.set(f, (tot.get(f) || 0) + (ct.unit === "pt" ? (it.punti || 0) : 1));
        }
        const ordinate = [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
        const m = new Map();
        ordinate.forEach((f, i) => m.set(f, i === 0 ? G.colore : TONI[(i - 1) % TONI.length]));
        return m;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ct]);
    const coloreDi = (off) => coloreFamiglia.get(famigliaOfferta(off)) || TONI[TONI.length - 1];
    const perOfferta = (items) => {
        const m = new Map();
        for (const it of items) {
            const k = String(it.offerta || it.prodotto || "—");
            const r = m.get(k) || { pt: 0, pz: 0, mnpPt: 0, mnpPz: 0 };
            r.pt = Math.round((r.pt + (it.punti || 0)) * 100) / 100; r.pz++;
            // SPLIT MNP vs GA (Luca 24/08: «di quegli otto pezzi quanti hanno
            // MNP e quanti no» — punteggi diversi): si legge dal prodotto
            if (/mnp/i.test(String(it.prodotto || ""))) { r.mnpPt = Math.round((r.mnpPt + (it.punti || 0)) * 100) / 100; r.mnpPz++; }
            m.set(k, r);
        }
        return [...m.entries()].sort((a, b) => (aPunti ? b[1].pt - a[1].pt : b[1].pz - a[1].pz));
    };
    // c'è almeno un'offerta MISTA nel tab attivo? → si accende la legenda
    const conMix = useMemo(() => gruppi.some((g) => {
        const m = new Map();
        for (const it of g.items) {
            const k = String(it.offerta || it.prodotto || "—");
            const r = m.get(k) || { pz: 0, mnp: 0 };
            r.pz++; if (/mnp/i.test(String(it.prodotto || ""))) r.mnp++;
            m.set(k, r);
        }
        return [...m.values()].some((r) => r.mnp > 0 && r.mnp < r.pz);
    }), [gruppi]);
    return createPortal(
        <div className={cn("an-scuro fixed inset-0 z-[9990] flex items-center justify-center p-4 transition-opacity duration-300", on ? "opacity-100" : "opacity-0")}
            style={{ background: "rgba(2,6,17,.78)", backdropFilter: "blur(6px)" }} onClick={chiudi}>
            <div onClick={(e) => e.stopPropagation()}
                className={cn("w-full max-w-[min(96vw,1900px)] max-h-[92vh] overflow-y-auto rounded-3xl border p-6 transition-all duration-300", on ? "scale-100 translate-y-0" : "scale-[.96] translate-y-3")}
                style={{ background: "linear-gradient(160deg, #0c1224, #090d1c 60%)", borderColor: `${G.colore}55`, boxShadow: `0 24px 90px rgba(0,0,0,.6), 0 0 60px ${G.colore}22` }}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                    <div className="flex items-center gap-3">
                        <LogoBrand chiave={G.chiave} h={30} />
                        <div>
                            <p className="text-sm font-black text-white leading-tight">{ct.emoji} Pista {ct.label} <span className="text-slate-500 font-semibold">· analisi</span></p>
                            <p className="text-[10px] text-slate-500">{ctx.etichettaScope || (ctx.persona ? `di ${ctx.persona}` : ctx.negozio)}{(ctx.etichettaPeriodo || ctx.periodoLabel) ? ` · ${ctx.etichettaPeriodo || ctx.periodoLabel}` : ""}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <span className="text-2xl font-black text-white tabular-nums leading-none"><Num v={ct.val} punti={ct.unit === "pt"} /></span>
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider ml-1">{ct.unit === "pt" ? "punti" : "pezzi"}</span>
                        </div>
                        <button onClick={chiudi} className="text-slate-500 hover:text-white text-xl leading-none px-1">✕</button>
                    </div>
                </div>
                {tabs.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {tabs.map((s, i) => (
                            <button key={s.l} onClick={() => setTab(i)}
                                className={cn("px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all", i === tab ? "text-white" : "text-slate-400 border-white/10 bg-white/[0.03] hover:bg-white/[0.07]")}
                                style={i === tab ? { background: `${G.colore}22`, borderColor: G.colore } : undefined}>
                                {s.l} <span className="tabular-nums" style={{ color: i === tab ? G.colore : undefined }}>{s.u === "pt" ? `${fmtPt(s.v)} pt` : `${fmtN(s.v)} pz`}</span>
                            </button>
                        ))}
                    </div>
                )}
                {gruppi.length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">Nessuna vendita in questa sorgente nel periodo.</p>
                ) : (
                    <div className={cn("grid gap-3", gruppi.length > 1 ? "sm:grid-cols-2" : "")}>
                        {gruppi.map((g) => {
                            const offerte = perOfferta(g.items);
                            const slices = offerte.map(([off, r]) => ({
                                label: off, colore: coloreDi(off),
                                val: aPunti ? r.pt : r.pz,
                                det: [{ l: "punti", r: fmtPt(r.pt) }, { l: "pezzi", r: fmtN(r.pz) }],
                            })).filter((s) => s.val > 0);
                            return (
                                <div key={g.nome} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <p className="text-xs font-black text-slate-100">{g.nome}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black tabular-nums" style={{ color: G.colore }}>{aPunti ? `${fmtPt(g.val)} pt` : `${fmtN(g.val)} pz`}</span>
                                            <button onClick={() => apriDrill({ titolo: `${G.label} · ${ct.label} · ${g.nome}`, sub: ctx.etichettaScope || (ctx.persona ? `di ${ctx.persona}` : ctx.negozio), items: g.items })}
                                                className="text-[10px] font-bold text-indigo-300 border border-indigo-400/30 bg-indigo-500/10 rounded-md px-2 py-0.5 hover:bg-indigo-500/20" title="Elenco contratti del sottogruppo">🔍 contratti</button>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 items-center">
                                        <div className="shrink-0">
                                            <Donut size={118} spessore={13} unit={aPunti ? "punti" : "pezzi"} slices={slices.length ? slices : [{ label: g.nome, colore: "rgba(255,255,255,.12)", val: 1, det: [] }]}
                                                centro={<><span className="text-base font-black text-white tabular-nums leading-none">{aPunti ? fmtPt(g.val) : fmtN(g.val)}</span><span className="text-[8px] text-slate-500 uppercase mt-0.5">{aPunti ? "pt" : "pz"}</span></>} />
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            {offerte.map(([off, r]) => (
                                                <div key={off} className="grid grid-cols-[1fr_auto] items-center gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] text-slate-300 leading-tight" title={off}>
                                                            <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: coloreDi(off) }} />{off}
                                                        </p>
                                                        <span className="flex h-1.5 rounded-full bg-white/5 overflow-hidden mt-0.5">
                                                            {(() => {
                                                                const tot = Math.max(0.01, g.val);
                                                                const vTot = aPunti ? r.pt : r.pz;
                                                                const vMnp = aPunti ? r.mnpPt : r.mnpPz;
                                                                const wTot = Math.max(4, (vTot / tot) * 100);
                                                                const misto = r.mnpPz > 0 && r.mnpPz < r.pz;
                                                                if (!misto) return <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${wTot}%`, background: r.mnpPz ? coloreDi(off) : `${coloreDi(off)}80` }} />;
                                                                const wMnp = wTot * (vMnp / Math.max(0.01, vTot));
                                                                return <>
                                                                    <span className="block h-full transition-all duration-700" style={{ width: `${wMnp}%`, background: coloreDi(off) }} title={`MNP: ${aPunti ? fmtPt(r.mnpPt) + " pt" : fmtN(r.mnpPz) + " pz"}`} />
                                                                    <span className="block h-full transition-all duration-700" style={{ width: `${wTot - wMnp}%`, background: `${coloreDi(off)}66` }} title={`GA/nuove: ${aPunti ? fmtPt(r.pt - r.mnpPt) + " pt" : fmtN(r.pz - r.mnpPz) + " pz"}`} />
                                                                </>;
                                                            })()}
                                                        </span>
                                                    </div>
                                                    <span className="text-[11px] font-black text-white tabular-nums whitespace-nowrap">{aPunti ? `${fmtPt(r.pt)} pt` : `${fmtN(r.pz)} pz`}<span className="text-slate-500 font-semibold"> · {fmtN(r.pz)} pz{r.mnpPz > 0 && r.mnpPz < r.pz ? ` · ${fmtN(r.mnpPz)} MNP (${Math.round((r.mnpPz / r.pz) * 100)}%) · ${fmtN(r.pz - r.mnpPz)} GA` : r.mnpPz === r.pz && r.pz > 0 ? " · tutte MNP" : ""}</span></span>
                                                </div>
                                            ))}

                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {conMix && (
                    <p className="text-[10px] text-slate-500 mt-3 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-1.5 rounded-full" style={{ background: G.colore }} /> tinta piena = MNP</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-1.5 rounded-full" style={{ background: `${G.colore}66` }} /> tinta chiara = GA / nuove attivazioni</span>
                    </p>
                )}
            </div>
        </div>, document.body
    );
}

/* ═══ CARTA OPERATORE ══════════════════════════════════════════════════ */
function CartaOperatore({ brand, ctx, size }) {
    const G = GARA[brand];
    const [drill, setDrill] = useState(null);
    // ANALISI ESPLOSA della pista (📊, Luca 24/08)
    const [analisi, setAnalisi] = useState(null);
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

    // Su W3/VF/FW niente totalone (piste = gare diverse, Luca 24/08): al
    // posto dell'anello, i CONTATORI PER PISTA con le sorgenti dentro e il
    // confronto col mese scorso PISTA PER PISTA. Sky tiene l'anello unico.
    const contatori = brand === "sky" ? [] : contatoriPiste(brand, sue, prev);
    return (
        <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <p className="text-[10px] text-slate-500 whitespace-nowrap">{fmtN(pezzi)} pezzi{brand === "sky" && ctx.confronto && <> · <Delta v={punti - puntiPrev} /> <span className="text-slate-600">pt vs mese scorso intero</span></>}</p>
                <div className="flex flex-wrap gap-1 justify-end">
                    {brand === "fw" && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-slate-300 border border-white/10">gara T2 · a pezzi</span>}
                    {brand === "sky" && perPista.map(([p, v]) => (
                        <span key={p} className="px-2 py-1 rounded-lg text-[10px] font-bold border border-white/10 text-white" style={{ background: `${G.colore}14` }}>
                            {PISTA_L[p] || p} <span className="tabular-nums" style={{ color: G.colore }}>{fmtPt(v)}</span> pt
                        </span>
                    ))}
                </div>
            </div>

            {/* MINI-ANELLI PER PISTA (Luca 24/08: «contatori circolari, stile
                gamification» — mai più riquadri piatti da gestionale anni 2000):
                le fette sono le SORGENTI dei punti in sfumature del colore
                brand, hover = dettaglio, click = elenco contratti, countUp al
                centro e delta vs mese scorso pista per pista. */}
            {contatori.length > 0 && (
                <div className={cn("grid gap-3 mb-4 justify-items-center", size >= 4 ? "grid-cols-3 xl:grid-cols-6" : "grid-cols-2 sm:grid-cols-3")}>
                    {contatori.map((ct) => {
                        const toni = [G.colore, `${G.colore}B3`, `${G.colore}66`, `${G.colore}40`];
                        const fmtV = (v, u) => (u === "pt" ? `${fmtPt(v)} pt` : `${fmtN(v)} pz`);
                        const slices = ct.val <= 0
                            ? [{ label: ct.label, colore: "rgba(255,255,255,.12)", val: 1, det: [] }]
                            : ct.sorgenti.length
                                ? ct.sorgenti.map((s, i) => ({ label: s.l, colore: toni[i % toni.length], val: s.v, det: [{ l: s.u === "pt" ? "punti" : "pezzi", r: s.u === "pt" ? fmtPt(s.v) : fmtN(s.v) }] }))
                                : [{ label: ct.label, colore: G.colore, val: ct.val, det: [{ l: ct.unit === "pt" ? "punti" : "pezzi", r: ct.unit === "pt" ? fmtPt(ct.val) : fmtN(ct.val) }] }];
                        return (
                            <div key={ct.chiave}
                                onClick={(e) => { e.stopPropagation(); setDrill({ titolo: `${G.label} · pista ${ct.label}`, sub: ctx.etichettaScope || (ctx.persona ? `di ${ctx.persona}` : ctx.negozio), items: ct.items }); }}
                                className="flex flex-col items-center gap-1 cursor-pointer group select-none"
                                title="Clicca per l'elenco contratti della pista">
                                <div className="transition-transform duration-200 group-hover:scale-[1.05]">
                                    <Donut size={size >= 4 ? 126 : 112} spessore={13} unit={ct.unit === "pt" ? "punti" : "pezzi"} slices={slices}
                                        centro={<>
                                            <span className="text-lg font-black text-white tabular-nums leading-none"><Num v={ct.val} punti={ct.unit === "pt"} /></span>
                                            <span className="text-[8px] text-slate-500 uppercase tracking-wider mt-0.5">{ct.unit === "pt" ? "punti" : "pezzi"}</span>
                                        </>} />
                                </div>
                                <div className="text-[10px] font-bold text-slate-200 flex items-center gap-1.5">
                                    <span>{ct.emoji} {ct.label}</span>
                                    {ctx.confronto && ct.val !== ct.prevVal && <Delta v={Math.round((ct.val - ct.prevVal) * 100) / 100} />}
                                    <button onClick={(e) => { e.stopPropagation(); setAnalisi(ct); }}
                                        className="text-[9px] font-black text-slate-400 border border-white/10 bg-white/[0.04] rounded-md px-1.5 py-0.5 hover:text-white hover:bg-white/[0.1] transition-colors"
                                        title="Analisi della pista: sottogruppi e spaccato punti per offerta">📊</button>
                                </div>
                                {ct.sorgenti.length > 0 && (
                                    <p className="text-[9px] text-slate-500 leading-tight text-center max-w-[140px] truncate">
                                        {ct.sorgenti.map((s) => `${s.l} ${fmtV(s.v, s.u).replace(" pt", "").replace(" pz", "")}`).join(" · ")}
                                    </p>
                                )}
                                {ct.nota && <p className="text-[9px] text-slate-600 leading-tight text-center max-w-[140px]">{ct.nota}</p>}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className={cn(brand === "sky" ? cn("flex gap-4", size >= 4 ? "flex-row items-start" : "flex-col sm:flex-row sm:items-start") : "")}>
                {brand === "sky" && (
                    <div className="shrink-0 mx-auto sm:mx-0">
                        <Donut size={size >= 4 ? 168 : 138} unit="punti"
                            slices={righe.map((r) => ({ label: r.label, emoji: r.emoji, colore: r.colore, val: somma(r.items), det: [{ l: "pezzi", r: fmtN(r.items.length) }, { l: "punti", r: fmtPt(somma(r.items)) }] }))}
                            centro={<>
                                <span className="text-2xl font-black text-white tabular-nums leading-none"><Num v={punti} punti /></span>
                                <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">punti totali</span>
                            </>} />
                    </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                    {righe.map((r) => {
                        const pt = somma(r.items);
                        return (
                            <Tip key={r.label} block tip={<div>
                                <TipTitolo>{r.emoji} {r.label}</TipTitolo>
                                <TipRiga l="pezzi" r={fmtN(r.items.length)} colore={r.colore} />
                                {brand !== "fw" && <TipRiga l="punti" r={fmtPt(pt)} />}
                                {r.det.map(([l, v]) => <TipRiga key={l} l={l} r={fmtN(v)} />)}
                                <p className="text-[10px] text-indigo-300 mt-1">👆 clicca per l'elenco contratti</p>
                            </div>}>
                                <div onClick={(e) => { e.stopPropagation(); setDrill({ titolo: `${G.label} · ${r.label}`, sub: ctx.etichettaScope || (ctx.persona ? `di ${ctx.persona}` : ctx.negozio), items: r.items }); }}
                                    className="grid grid-cols-[minmax(110px,1.1fr)_2fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors cursor-pointer">
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
                        {escluse > 0 && <Tip tip={<div><TipTitolo>Esclusioni lettera A</TipTitolo><p className="text-[11px] text-slate-300 max-w-[220px]">MNP con provenienza Vodafone/Fastweb/Ho.: contano come pezzi ma la lettera non dà punti. Clicca per l'elenco.</p></div>}><span onClick={(e) => { e.stopPropagation(); setDrill({ titolo: `${G.label} · MNP escluse da lettera`, items: sue.filter((it) => it.esclusa) }); }} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-400 cursor-pointer hover:bg-white/10">🚫 {escluse} MNP escluse</span></Tip>}
                        {senzaRiga > 0 && <Tip tip={<div><TipTitolo>Senza riga di gara</TipTitolo><p className="text-[11px] text-slate-300 max-w-[220px]">Vendite del perimetro che non agganciano nessuna riga del tabellare: pezzi sì, punti no. Clicca per l'elenco.</p></div>}><span onClick={(e) => { e.stopPropagation(); setDrill({ titolo: `${G.label} · senza punti`, items: sue.filter((it) => it.senzaRiga) }); }} className="px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/25 text-[10px] text-amber-200 cursor-pointer hover:bg-amber-400/20">⚠ {senzaRiga} senza punti</span></Tip>}
                        {t1 > 0 && <Tip tip={<div><TipTitolo>Fastweb su codici T1</TipTitolo><p className="text-[11px] text-slate-300 max-w-[220px]">Contano nella gara Vodafone (lettera A): i punti stanno nella carta Vodafone. Clicca per l'elenco.</p></div>}><span onClick={(e) => { e.stopPropagation(); setDrill({ titolo: "Fastweb in gara Vodafone (lettera A)", items: ctx.items.filter((it) => it.brandGara === "vf" && it.fwInA) }); }} className="px-2 py-0.5 rounded-md bg-yellow-400/10 border border-yellow-400/25 text-[10px] text-yellow-200 cursor-pointer hover:bg-yellow-400/20">🟨 {t1} in gara Vodafone</span></Tip>}
                    </div>
                </div>
            </div>
            {analisi && <AnalisiPistaPanel G={G} ct={analisi} ctx={ctx} chiudi={() => setAnalisi(null)} apriDrill={(d) => setDrill(d)} drillAperto={!!drill} />}
            <DrillPanel drill={drill} chiudi={() => setDrill(null)} labels={ctx.labels} />
        </div>
    );
}

/* ═══ CARTA "ALTRO OPERATORE" (Luca 21/08 notte-2: S4, TIM, Very e tutti
   gli altri brand — «a disposizione nei widget», fuori dal layout di
   default). Fuori dalle gare: si ragiona a PEZZI, partizione per categoria
   coi prodotti nel tooltip e drill fino ai contratti. ══════════════════ */
function CartaAltro({ chiave, nome, colore, ctx, size }) {
    const [drill, setDrill] = useState(null);
    const sue = useMemo(() => (ctx.altri || []).filter((a) => trkBrandKey(a.brand) === chiave), [ctx.altri, chiave]);
    const righe = useMemo(() => {
        const per = new Map();
        for (const it of sue) { const c = it.categoria || "Altro"; (per.get(c) || per.set(c, []).get(c)).push(it); }
        return [...per.entries()].map(([label, items2]) => ({ label, items: items2 })).sort((a, b) => b.items.length - a.items.length);
    }, [sue]);
    const COLORI = ["#818cf8", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6", "#f97316", "#e879f9", "#64748b"];
    if (!sue.length) return (
        <div className="flex items-center gap-3 py-6 justify-center text-slate-500 text-xs">
            <LogoBrand chiave={chiave} h={20} /> nessuna vendita {nome} nel periodo
        </div>
    );
    return (
        <div>
            <p className="text-[10px] text-slate-500 mb-3 tabular-nums">{fmtN(sue.length)} pezzi <span className="text-slate-600">· fuori dalle gare a punti: si conta a pezzi</span></p>
            <div className={cn("flex gap-4", size >= 4 ? "flex-row items-start" : "flex-col sm:flex-row sm:items-start")}>
                <div className="shrink-0 mx-auto sm:mx-0">
                    <Donut size={size >= 4 ? 160 : 132} unit="pezzi"
                        slices={righe.map((r, i) => ({
                            label: r.label, colore: COLORI[i % COLORI.length], val: r.items.length,
                            det: Object.entries(r.items.reduce((m, it) => { const k = String(it.offerta || it.prodotto || "—").slice(0, 26); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, q]) => ({ l: p, r: fmtN(q) })),
                        }))}
                        centro={<><span className="text-2xl font-black text-white tabular-nums leading-none"><Num v={sue.length} punti={false} /></span><span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">pezzi</span></>} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                    {righe.map((r, i) => (
                        <Tip key={r.label} block tip={<div>
                            <TipTitolo>{r.label}</TipTitolo>
                            <TipRiga l="pezzi" r={fmtN(r.items.length)} colore={COLORI[i % COLORI.length]} />
                            {Object.entries(r.items.reduce((m, it) => { const k = String(it.offerta || it.prodotto || "—").slice(0, 28); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, q]) => <TipRiga key={p} l={p} r={fmtN(q)} />)}
                            <p className="text-[10px] text-indigo-300 mt-1">👆 clicca per l'elenco contratti</p>
                        </div>}>
                            <div onClick={(e) => { e.stopPropagation(); setDrill({ titolo: `${nome} · ${r.label}`, items: r.items }); }}
                                className="grid grid-cols-[minmax(110px,1.2fr)_2fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors cursor-pointer">
                                <span className="text-xs font-semibold text-slate-200 truncate">{r.label}</span>
                                <span className="h-2 rounded-full bg-white/5 overflow-hidden">
                                    <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, (r.items.length / sue.length) * 100)}%`, background: `linear-gradient(90deg, ${COLORI[i % COLORI.length]}55, ${COLORI[i % COLORI.length]})` }} />
                                </span>
                                <span className="text-[11px] font-black text-white tabular-nums text-right w-12">{fmtN(r.items.length)} pz</span>
                            </div>
                        </Tip>
                    ))}
                </div>
            </div>
            <DrillPanel drill={drill} chiudi={() => setDrill(null)} labels={ctx.labels} />
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
        for (const r of righe) { const k = r.prodotto || "—"; (per[k] ??= { val: 0, qty: 0 }); per[k].val += valDi(r); per[k].qty += qtyDi(r); }
        return Object.entries(per).sort((a, b) => b[1].val - a[1].val).slice(0, size >= 4 ? 10 : 6);
    }, [righe, size]);
    const perGiorno = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, val: 0, det: [], chiuso: !!ctx.chiusi?.[i] }));
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
                    {ctx.confronto && <p className="pt-1"><Delta v={venduto - vendutoPrev} euro /> <span className="text-[10px] text-slate-500">venduto vs mese scorso intero</span></p>}
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
                    <div className="w-[58px] h-[58px] rounded-full bg-[#10132a] grid place-items-center an-scuro">
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
                label: "Marginalità", logoChiave: "marginalita", colore: HEX_BRAND.marginalita, perc: val(storeExt) > 0 ? (val(mieiExt) / val(storeExt)) * 100 : 0,
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
            const colore = HEX_BRAND[trkBrandKey(brand)] || "#64748b";
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
        return { k, label: k, val, det, me: norm(k) === norm(ctx.persona), colore: metrica === "pezzi" ? "#818cf8" : GARA[metrica].colore };
    }).filter((r) => r.val > 0).sort((a, b) => b.val - a.val);
    return <RaceBars unit={metrica === "pezzi" ? "pz" : "pt"} righe={righe} vuoto="Nessuna vendita nel periodo." />;
}

function WidgetDuello({ ctx }) {
    const [rivaleSel, setRivaleSel] = useState("");
    const miei = ctx.negozi || [ctx.negozio];
    const èMio = (n) => miei.some((m) => norm(m) === norm(n));
    const rivale = rivaleSel || ctx.negoziTutti.find((n) => !èMio(n)) || "";
    const mio = ctx.itemsRete.filter((it) => èMio(it.negozio));
    const suo = ctx.itemsRete.filter((it) => norm(it.negozio) === norm(rivale));
    const brands = ["w3", "vf", "sky"];
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-white">{ctx.negozio}</span>
                <span className="text-[10px] text-slate-500">vs</span>
                <SelectOpzioni value={rivale} onChange={setRivaleSel} opzioni={ctx.negoziTutti.filter((n) => !èMio(n))} placeholder="sfida…" className="min-w-[130px]" />
            </div>
            <div className="space-y-2.5">
                {brands.map((b) => {
                    const a = somma(mio.filter((it) => it.brandGara === b)), c = somma(suo.filter((it) => it.brandGara === b));
                    if (!a && !c) return null;
                    const max = Math.max(a, c, 1);
                    return (
                        <div key={b}>
                            <div className="mb-0.5"><LogoBrand chiave={GARA[b].chiave} colore={GARA[b].colore} alt={GARA[b].label} h={18} /></div>
                            {[[a, "#818cf8"], [c, GARA[b].colore]].map(([v, col], i) => (
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
    const media = totale > 0 ? Math.round((totale / Math.max(1, ctx.gLav || 1)) * 100) / 100 : null;
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
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, val: 0, det: [], chiuso: !!ctx.chiusi?.[i] }));
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
    "op:w3": { nome: "WindTre", emoji: "🟠", gruppo: "operatori", def: 2, solo: null, logoChiave: "windtre", logoColore: HEX_BRAND.windtre, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="w3" ctx={ctx} size={size} /> },
    "op:vf": { nome: "Vodafone", emoji: "🔴", gruppo: "operatori", def: 2, logoChiave: "vodafone", logoColore: HEX_BRAND.vodafone, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="vf" ctx={ctx} size={size} /> },
    "op:sky": { nome: "Sky", emoji: "🟣", gruppo: "operatori", def: 2, logoChiave: "sky", logoColore: HEX_BRAND.sky, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="sky" ctx={ctx} size={size} /> },
    "op:fw": { nome: "Fastweb T2", emoji: "🟡", gruppo: "operatori", def: 2, logoChiave: "fastweb", logoColore: HEX_BRAND.fastweb, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="fw" ctx={ctx} size={size} /> },
    "marg": { nome: "Marginalità · venduto", emoji: "💰", gruppo: "marginalità", def: 4, logoChiave: "marginalita", logoColore: "#06b6d4", nomeBreve: "", render: (ctx, size) => <WidgetMarg ctx={ctx} size={size} /> },
    // ── gli ALTRI operatori (Luca 21/08: «a disposizione nei widget», fuori
    //    dal layout di default — si aggiungono dalla galleria) ─────────────
    "op:s4": { nome: "S4 Energia", emoji: "🟢", gruppo: "operatori", def: 2, logoChiave: "s4", logoColore: HEX_BRAND.s4, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="s4" nome="S4 Energia" ctx={ctx} size={size} /> },
    "op:tim": { nome: "TIM", emoji: "🔵", gruppo: "operatori", def: 2, logoChiave: "tim", logoColore: HEX_BRAND.tim, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="tim" nome="TIM" ctx={ctx} size={size} /> },
    "op:very": { nome: "Very Mobile", emoji: "🟩", gruppo: "operatori", def: 2, logoChiave: "verymobile", logoColore: HEX_BRAND.verymobile, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="verymobile" nome="Very Mobile" ctx={ctx} size={size} /> },
    "op:iliad": { nome: "Iliad", emoji: "🟥", gruppo: "operatori", def: 2, logoChiave: "iliad", logoColore: HEX_BRAND.iliad, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="iliad" nome="Iliad" ctx={ctx} size={size} /> },
    "op:ho": { nome: "Ho. Mobile", emoji: "🟪", gruppo: "operatori", def: 2, logoChiave: "homobile", logoColore: HEX_BRAND.homobile, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="homobile" nome="Ho. Mobile" ctx={ctx} size={size} /> },
    "op:kena": { nome: "Kena Mobile", emoji: "🟠", gruppo: "operatori", def: 2, logoChiave: "kenamobile", logoColore: HEX_BRAND.kenamobile, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="kenamobile" nome="Kena Mobile" ctx={ctx} size={size} /> },
    "op:dojo": { nome: "Dojo", emoji: "🟦", gruppo: "operatori", def: 2, logoChiave: "dojo", logoColore: HEX_BRAND.dojo, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="dojo" nome="Dojo" ctx={ctx} size={size} /> },
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
    io: ["op:w3@2", "op:vf@2", "op:sky@2", "op:fw@2", "posizioni@1", "bersaglio@1", "pesonegozi@2", "marg@4", "mix:pezzi@1", "ritmo@1"],
    negozio: ["op:w3@2", "op:vf@2", "op:sky@2", "op:fw@2", "squadra:pezzi@2", "duello@1", "mix:pezzi@1", "marg@4", "ritmo@1", "squadra:w3@2"],
};
