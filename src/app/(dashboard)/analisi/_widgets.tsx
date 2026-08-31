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

import { IconaSim } from "@/components/IconaSim";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TRK_BRAND_LOGOS, TRK_LOGO_SCALE, trkBrandKey } from "@/lib/brandAssets";
import { brandIdDaLabel } from "@/lib/commissioning";
import { SelectOpzioni } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { Num, Tip, TipRiga, TipTitolo, BarStack, RaceBars, HeatCal, Donut, Delta, AnelloScaglioni, SogliaBar, fmtPt, fmtN, fmtEuro } from "./_charts";

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
            <img src={TRK_BRAND_LOGOS[chiave]} alt={alt || chiave} draggable={false} className="object-contain select-none"
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
        aggiungi(<IconaSim />, "Mobile (SIM)", "#818cf8", sim, [
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
        aggiungi(<IconaSim />, "Mobile MNP", "#818cf8", mnp);
        aggiungi(<IconaSim />, "Mobile GA", "#c084fc", ga, [["ric. automatica", sub(ga, (it) => /ric\.? ?auto/i.test(String(it.categoria || "")))], ["ricarica pura", sub(ga, (it) => /wallet/i.test(String(it.categoria || "")))]]);
    } else if (brand === "fw") {
        const mob = prendi((it) => /^(mobile|sim)/i.test(String(it.categoria || "")) || èTel(it.categoria));
        const fis = prendi((it) => /^(fisso|fibra)/i.test(String(it.categoria || "")));
        const ene = prendi((it) => /^energia/i.test(String(it.categoria || "")));
        aggiungi(<IconaSim />, "Mobile", "#facc15", mob);
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
/* ── DRILL MONO-BRAND della timeline (Luca 24/08): quando resta acceso UN
   SOLO operatore, la barra non è più monocolore col totale — si spacca
   nelle sue PISTE, ognuna in una sfumatura del colore del brand. Business
   FUSO dentro mobile/fisso (niente sesta sfumatura); S4 = luce vs gas;
   Sky = fisso/mobile/TV. Il totale NON cambia: si colora soltanto. ─────── */
const PISTE_TL = {
    w3: [["mobile", "📶 Mobile"], ["fisso", "🌐 Fisso"], ["cb", "🔁 Customer Base"], ["lucegas", "⚡ Luce & Gas"], ["assic", "🛡 Assicurazioni"], ["altro", "📦 Altro"]],
    vf: [["mobile", "📶 Mobile"], ["fisso", "🌐 Fisso"], ["cb", "🔁 Customer Base"], ["lucegas", "⚡ Luce & Gas"], ["assic", "🛡 Assicurazioni"], ["altro", "📦 Altro"]],
    fw: [["mobile", "📶 Mobile"], ["fisso", "🌐 Fisso"], ["energia", "⚡ Energia"], ["altro", "📦 Altro"]],
    sky: [["fisso", "🌐 Fisso"], ["mobile", "📶 Mobile"], ["tv", "📺 TV"], ["altro", "📦 Altro"]],
    s4: [["luce", "💡 Luce"], ["gas", "🔥 Gas"]],
};
function pistaTimelineDi(bk, it) {
    const cat = String(it.categoria || ""), prod = String(it.prodotto || "");
    if (bk === "s4") return /gas/i.test(prod) ? "gas" : "luce";
    if (bk === "sky") {
        if (/tv/i.test(cat)) return "tv";
        if (/mobile/i.test(cat)) return "mobile";
        if (/fisso/i.test(cat)) return "fisso";
        return "altro";
    }
    if (bk === "fw") {
        if (/^mobile/i.test(cat) || /^telefono a rate/i.test(cat)) return "mobile";
        if (/^fisso/i.test(cat)) return "fisso";
        if (/^energia/i.test(cat)) return "energia";
        return "altro";
    }
    // w3 / vf: la pista arriva dal motore gare (it.pista); business dentro
    // mobile/fisso, telefoni GA nel mobile (pezzi in barra); i telefoni CB
    // W3 arrivano con pista "cb" (Partnership), quelli VF maturano in mobile
    if (/assicurazion/i.test(prod + " " + cat)) return "assic";
    const p = String(it.pista || "");
    if (p === "mobile" || p === "business_mobile") return "mobile";
    if (p === "fisso" || p === "business_fisso") return "fisso";
    if (p === "cb") return "cb";
    if (p === "lucegas" || p === "luce" || p === "gas") return "lucegas";
    if (p === "assicurazioni") return "assic";
    if (/^customer base/i.test(cat)) return "cb";
    if (/^telefono a rate/i.test(cat)) return /cb\s*$/i.test(prod) ? "cb" : "mobile";
    if (/^mobile/i.test(cat)) return "mobile";
    if (/^fisso/i.test(cat)) return "fisso";
    if (/^energia/i.test(cat) || /\b(luce|gas)\b/i.test(prod)) return "lucegas";
    return "altro";
}
// tonalità nella famiglia del colore brand (Luca 24/08: «le sfumature di
// arancione non bastano»): le piste si distribuiscono su un ARCO DI TINTE
// centrato sul colore del brand — per W3 dal rosso-corallo all'ambra,
// per VF dal magenta all'arancio, Sky dal blu al magenta… colori davvero
// distinguibili ma sempre della stessa famiglia, mai fuori palette.
function sfumaturaDi(hex, i, n) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m || n <= 1) return hex;
    const num = parseInt(m[1], 16);
    const r = (num >> 16) / 255, g = ((num >> 8) & 255) / 255, b = (num & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
    }
    const l = (mx + mn) / 2;
    const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    const t = i / (n - 1);
    // ARCO ORIENTATO PER FAMIGLIA (Luca 24/08: «niente colori di altri
    // brand»): i caldi non scendono mai nel ROSSO di Vodafone — per W3 la
    // scala va dal MARRONE (arancio scuro) all'ambra al giallo; il rosso VF
    // resta tra bordeaux e corallo senza salire nell'arancio; gli altri
    // orbitano attorno al proprio tono. La LUMINOSITÀ cresce con la tinta
    // (scuro → chiaro) e fa da secondo separatore.
    const rosso = h < 18 || h > 340;
    const giallo = h >= 40 && h <= 70;
    const [hDa, hA] = rosso ? [h - 22, h + 10] : giallo ? [h - 16, h + 16] : [h - 5, h + 30];
    const h2 = ((hDa + (hA - hDa) * t) % 360 + 360) % 360;
    const l2 = Math.min(0.68, Math.max(0.30, l - 0.16 + 0.30 * t));
    const s2 = Math.min(1, Math.max(0.55, sat));
    return `hsl(${Math.round(h2)}, ${Math.round(s2 * 100)}%, ${Math.round(l2 * 100)}%)`;
}

export function TimelineHero({ ctx, tecnico = false }) {
    // RIPENSAMENTO Luca 24/08: la Marginalità sta nella timeline SOLO per i
    // TECNICI (è il loro mondo) e in FATTURATO €; per tutti gli altri, fuori.
    // `tecnico` = ruolo della PERSONA OSSERVATA (o del collaboratore
    // filtrato), calcolato dalla pagina — non di chi sta guardando.
    // La produzione della persona/negozio: i 4 brand in gara + gli ALTRI
    // operatori (S4, TIM, Very…) — la marginalità qui non c'è più (vive
    // nella variante tecnico, in €). Le pill sotto (solo loghi) accendono
    // e spengono la serie; UNA sola accesa → drill per pista.
    const serie = useMemo(() => {
        const out = new Map();
        const add = (key, label, colore, chiave, g, nome, pezzi = 1, pista = null) => {
            if (g < 1 || g > ctx.nG) return;
            const sr = out.get(key) || { key, label, colore, chiave, tot: 0, giorni: new Map() };
            const gg = sr.giorni.get(g) || { val: 0, prod: new Map(), pi: new Map() };
            gg.val += pezzi; sr.tot += pezzi;
            const nm = String(nome || "—").slice(0, 30);
            gg.prod.set(nm, (gg.prod.get(nm) || 0) + pezzi);
            if (pista) {
                const pp = gg.pi.get(pista) || { val: 0, prod: new Map() };
                pp.val += pezzi; pp.prod.set(nm, (pp.prod.get(nm) || 0) + pezzi);
                gg.pi.set(pista, pp);
            }
            sr.giorni.set(g, gg);
            out.set(key, sr);
        };
        // gare + altri operatori per TUTTI (correzione Luca 24/08: il tecnico
        // che «vende qualcosa in servizi» deve vedere anche quello)
        for (const it of ctx.items) {
            const G = GARA[it.brandGara];
            if (G) add(it.brandGara, G.label, G.colore, G.chiave, it.g, it.offerta || it.prodotto, 1, pistaTimelineDi(it.brandGara, it));
        }
        for (const r of (ctx.altri || [])) {
            const k = trkBrandKey(r.brand);
            if (!k) continue;
            add(`alt:${k}`, r.brand, HEX_BRAND[k] || "#64748b", k, r.g, r.offerta || r.prodotto, 1, k === "s4" ? pistaTimelineDi("s4", r) : null);
        }
        // VENDITE DI OGGI DEI BRAND IN GARA (Luca 26/08: «il negozio con 32
        // vendite ne vede 3»): il cutoff dell'ora di scatto le tiene fuori da
        // ctx.items — giusto per soglie e proiezioni, ma qui il negozio deve
        // vedere subito quello che ha fatto. Vanno nella serie del LORO brand
        // (chiave GARA, non alt:) altrimenti nascono due pill dello stesso
        // operatore.
        for (const r of (ctx.oggiGara || [])) {
            const kb = brandIdDaLabel(r.brand);
            const bg = kb === "windtre" ? "w3" : kb === "vodafone" ? "vf" : kb === "fastweb" ? "fw" : kb === "sky" ? "sky" : null;
            const G = bg ? GARA[bg] : null;
            if (!G) continue;
            add(bg, G.label, G.colore, G.chiave, r.g, r.offerta || r.prodotto, 1, pistaTimelineDi(bg, r));
        }
        if (tecnico) {
            // …e SOLO il tecnico ha in più la Marginalità, in FATTURATO €:
            // unità incompatibile coi pezzi → mai nella stessa barra (la pill
            // attraversa i due mondi isolando)
            for (const r of (ctx.ext || [])) add("marg", "Marginalità", HEX_BRAND.marginalita || "#06b6d4", "marginalita", r.g, r.prodotto, Number(r.prezzo) || 0);
            const m = out.get("marg");
            if (m) m.euro = true;
        }
        // l'ordine vale anche per gli ALTRI operatori: ordinarli per volume
        // li faceva scambiare di posto da un mese all'altro
        const ordine = ["w3", "vf", "fw", "sky", "alt:s4", "alt:tim", "alt:verymobile",
            "alt:homobile", "alt:iliad", "alt:kenamobile", "alt:dojo", "marg"];
        return [...out.values()].sort((a, b) => {
            const ia = ordine.indexOf(a.key), ib = ordine.indexOf(b.key);
            if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            return b.tot - a.tot;
        });
    }, [ctx.items, ctx.ext, ctx.altri, ctx.nG, tecnico]);
    const [spenti, setSpenti] = useState(() => new Set());
    // dentro il drill si possono filtrare anche le SINGOLE PISTE (Luca 24/08:
    // «il day by day delle singole categorie»): stessa logica isola/aggiungi
    const [pisteSpente, setPisteSpente] = useState(() => new Set());
    // cambio di persona osservata, area o modalità → pill tutte riaccese
    // (rilievo revisore: la selezione su A non deve svuotare il grafico di B)
    useEffect(() => { setSpenti(new Set()); setPisteSpente(new Set()); }, [tecnico, ctx.areaKey, ctx.persona, ctx.negozio]);
    // la marg (€) DOMINA quando accesa: le serie a pezzi restano fuori dalla
    // barra (unità diverse) — le loro pill appaiono spente e il click le isola
    const margAccesa = useMemo(() => serie.some((sr) => sr.key === "marg" && !spenti.has(sr.key)), [serie, spenti]);
    // cambio del brand isolato (o uscita dal drill) → piste tutte riaccese
    const soloKey = useMemo(() => {
        const accese = margAccesa ? serie.filter((sr) => sr.key === "marg") : serie.filter((sr) => !spenti.has(sr.key));
        return accese.length === 1 ? accese[0].key : null;
    }, [serie, spenti, margAccesa]);
    useEffect(() => { setPisteSpente(new Set()); }, [soloKey]);
    const toggle = (k) => setSpenti((prev) => {
        const tutte = serie.map((sr) => sr.key);
        const haMarg = tutte.includes("marg");
        const accese = tutte.filter((key) => !prev.has(key));
        const margAcc = haMarg && accese.includes("marg");
        // € e pezzi non convivono: il click che attraversa i mondi ISOLA
        if (haMarg && margAcc && k === "marg") return prev;
        if (haMarg && k === "marg" && !margAcc) return new Set(tutte.filter((key) => key !== "marg"));
        if (haMarg && margAcc && k !== "marg") return new Set(tutte.filter((key) => key !== k));
        // dalla situazione generale il click ISOLA il brand (Luca 24/08)…
        if (accese.length === tutte.length && tutte.length > 1) return new Set(tutte.filter((key) => key !== k));
        // …il click sull'unico acceso riporta al totale (mai grafico vuoto)
        if (accese.length === 1 && accese[0] === k) return new Set();
        // …e in selezione parziale gli altri si aggiungono / tolgono
        const n = new Set(prev);
        if (n.has(k)) n.delete(k); else n.add(k);
        return n;
    });
    const { giorni, legenda } = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, tot: 0, parti: [] }));
        const topProd = (prod, euro = false) => {
            const top = [...prod.entries()].sort((a, b) => b[1] - a[1]);
            return top.slice(0, 4).map(([nm, q]) => (euro ? `${fmtN(q)} € · ${nm}` : `${q}× ${nm}`)).join(" · ") + (top.length > 4 ? ` · +${top.length - 4} altri` : "");
        };
        // DRILL: un solo operatore acceso e con piste note → barre per pista
        const solo = soloKey ? serie.find((sr) => sr.key === soloKey) : null;
        const bk = solo ? (solo.key.startsWith("alt:") ? solo.key.slice(4) : solo.key) : null;
        const pisteDef = bk && PISTE_TL[bk] ? PISTE_TL[bk] : null;
        if (solo && pisteDef) {
            const totPista = new Map();
            for (const [, gg] of solo.giorni) for (const [pk, pp] of (gg.pi || new Map())) totPista.set(pk, (totPista.get(pk) || 0) + pp.val);
            const presenti = pisteDef.filter(([pk]) => (totPista.get(pk) || 0) > 0);
            const colori = new Map(presenti.map(([pk], i) => [pk, sfumaturaDi(solo.colore, i, presenti.length)]));
            for (const [g, gg] of solo.giorni) {
                // ordine piste FISSO giorno su giorno: stack leggibile, niente sort per valore
                for (const [pk, lbl] of presenti) {
                    if (pisteSpente.has(pk)) continue;
                    const pp = gg.pi?.get(pk);
                    if (!pp?.val) continue;
                    v[g - 1].parti.push({ label: lbl, colore: colori.get(pk), val: Math.round(pp.val * 100) / 100, prodotti: topProd(pp.prod) });
                    v[g - 1].tot += pp.val;
                }
            }
            const legenda = presenti.map(([pk, lbl]) => ({ k: pk, label: lbl, colore: colori.get(pk), tot: totPista.get(pk) || 0, off: pisteSpente.has(pk) }));
            return { giorni: v, legenda };
        }
        for (const sr of serie) {
            if (spenti.has(sr.key) || (margAccesa && sr.key !== "marg")) continue;
            for (const [g, gg] of sr.giorni) {
                v[g - 1].parti.push({ label: sr.label, colore: sr.colore, val: Math.round(gg.val * 100) / 100, prodotti: topProd(gg.prod, !!sr.euro) });
                v[g - 1].tot += gg.val;
            }
        }
        // ORDINE FISSO DEGLI OPERATORI NELLA PILA (Luca 28/08: «se decidiamo
        // che la prima è WindTre, la seconda Vodafone, la terza Fastweb, a
        // primo impatto vedo subito i giorni in cui abbiamo lavorato di più o
        // di meno un operatore»). Prima si ordinava per VALORE dentro ogni
        // giorno: la stessa fascia cambiava colore da un giorno all'altro e
        // l'occhio non poteva seguire un brand lungo il mese. Ora l'ordine è
        // quello di `serie` — w3, vf, fw, sky, poi gli altri — e le fette si
        // impilano sempre uguali. Vale per Io, Negozio e Rete: il grafico è
        // lo stesso componente.
        return { giorni: v, legenda: null };
    }, [serie, spenti, soloKey, pisteSpente, margAccesa, ctx.nG, ctx.labels, tecnico]);
    // «isola poi aggiungi» anche per le piste: dal drill completo il click
    // isola la categoria, i successivi aggiungono, l'ultimo acceso → tutte
    const togglePista = (pk) => setPisteSpente((prev) => {
        const tutte = (legenda || []).map((pz) => pz.k);
        const accese = tutte.filter((key) => !prev.has(key));
        if (accese.length === tutte.length && tutte.length > 1) return new Set(tutte.filter((key) => key !== pk));
        if (accese.length === 1 && accese[0] === pk) return new Set();
        const n = new Set(prev);
        if (n.has(pk)) n.delete(pk); else n.add(pk);
        return n;
    });
    // DOMENICHE E GIORNI ROSSI nascosti di default (Luca 24/08): ctx.chiusi
    // arriva dal calendario delle gare + domeniche. Un giorno chiuso CON
    // vendite resta visibile comunque: mai nascondere dati reali.
    const [mostraChiusi, setMostraChiusi] = useState(false);
    const giorniVisibili = useMemo(
        () => (mostraChiusi ? giorni : giorni.filter((g, idx) => !ctx.chiusi?.[idx] || g.tot > 0)),
        [giorni, mostraChiusi, ctx.chiusi],
    );
    const nNascosti = giorni.length - giorniVisibili.length;
    const oggiIdx = ctx.oggi > 0 ? giorniVisibili.findIndex((g) => g.n === ctx.oggi) : -1;
    const totale = giorni.reduce((sm, g) => sm + g.tot, 0);
    const media = totale > 0 ? Math.round((totale / Math.max(1, ctx.gLav || 1)) * 100) / 100 : null;
    if (!serie.length) return tecnico ? (
        <div className="mt-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-slate-400">
            Nessuna produzione registrata nel periodo.
        </div>
    ) : null;
    return (
        <div className="relative mt-3">
            <BarStack giorni={giorniVisibili} oggi={oggiIdx} media={media} unit={margAccesa ? "€" : "pz"} h={92} />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
                {serie.map((sr) => {
                    const off = spenti.has(sr.key) || (margAccesa && sr.key !== "marg");
                    const nAccese = margAccesa ? 1 : serie.filter((x) => !spenti.has(x.key)).length;
                    const azione = sr.key === "marg" && !margAccesa ? "Passa alla marginalità (€)"
                        : margAccesa && sr.key !== "marg" ? `Isola ${sr.label} (pezzi)`
                        : spenti.size === 0 && serie.length > 1 && !margAccesa ? `Isola ${sr.label}`
                        : off ? `Aggiungi ${sr.label}` : nAccese === 1 ? (serie.some((x) => x.key === "marg") ? "Torna alla marginalità" : "Rimetti tutti i brand") : `Togli ${sr.label}`;
                    return (
                        <button key={sr.key} onClick={() => toggle(sr.key)}
                            title={`${azione} · ${fmtN(sr.tot)} ${sr.euro ? "€" : "pz"} nel periodo`}
                            className={cn("flex items-center px-2.5 py-1.5 rounded-lg border transition-all", off ? "border-white/10 bg-white/[0.02] opacity-35 grayscale" : "border-white/10 bg-white/[0.05] hover:bg-white/[0.09]")}>
                            <LogoBrand chiave={sr.chiave} h={15} />
                        </button>
                    );
                })}
                {legenda && legenda.map((pz) => {
                    const nAcc = legenda.filter((x) => !x.off).length;
                    const az = legenda.every((x) => !x.off) && legenda.length > 1 ? `Isola ${pz.label}` : pz.off ? `Aggiungi ${pz.label}` : nAcc === 1 ? "Rimetti tutte le categorie" : `Togli ${pz.label}`;
                    return (
                        <button key={pz.k} onClick={() => togglePista(pz.k)} title={az}
                            className={cn("flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border transition-all", pz.off ? "border-white/10 bg-white/[0.02] text-slate-500 opacity-40 grayscale" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.09]")}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pz.colore, boxShadow: pz.off ? "none" : `0 0 5px ${pz.colore}66` }} />
                            {pz.label} · <b className="text-slate-100">{fmtPt(pz.tot)}</b> pz
                        </button>
                    );
                })}
                <span className="text-[10px] text-slate-500 ml-1">{margAccesa ? "fatturato marginalità giorno per giorno · click su un logo per i pezzi" : legenda ? "barre per pista · click sulle categorie per isolarle o aggiungerle" : "produzione giorno per giorno · click sui loghi per filtrare"}</span>
                {(nNascosti > 0 || mostraChiusi) && (
                    <button type="button" onClick={() => setMostraChiusi((x) => !x)}
                        title={mostraChiusi ? "Rinascondi domeniche e festivi senza vendite" : "Mostra anche domeniche e giorni rossi del calendario"}
                        className={cn("ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all", mostraChiusi ? "border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" : "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.09] hover:text-slate-200")}>
                        🔴 {mostraChiusi ? "nascondi festivi" : `${nNascosti} festiv${nNascosti === 1 ? "o" : "i"} · mostra`}
                    </button>
                )}
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
        // REGOLA LUCA 24/08 (caso Damiano/Assicurazioni): i contatori di
        // pista si mostrano SEMPRE, anche a 0 — sparisce solo il catch-all
        // "Altro", che non è una pista di gara ma un residuo
        if (chiave === "altro" && !items.length && !(prevItems || []).length) return;
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
        // il tabellare VF ha piste "luce" e "gas" SEPARATE (rilievo revisore
        // 24/08: il contatore restava sempre vuoto) — qui si sommano
        const lg = [...pista(sue, "lucegas"), ...pista(sue, "luce"), ...pista(sue, "gas")];
        const lgP = [...pista(prev, "lucegas"), ...pista(prev, "luce"), ...pista(prev, "gas")];
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
    /* ANELLO PICCOLO DEL BOOST MNP (Luca 26/08: «un anello più piccolino
       sotto a quello Wallet e uno sotto a quello Ricarica automatica, che
       gli dice che ci sono anche questi extra punti dovuti alle MNP da
       operatori speciali»). La lettera franchising: «le attivazioni W3 in
       MNP provenienti da Iliad, Coop, Poste, Tiscali avranno punteggio
       extra 1,0». I punti NON si ricalcolano qui: si leggono da boostProv,
       che l'analisi prende dal set del motore — così se domani la regola
       cambia, l'anello cambia con lei. */
    const COLORI_PROV = { iliad: "#f97316", poste: "#facc15", coop: "#ef4444", tiscali: "#38bdf8" };
    const famigliaProv = (p) => {
        const x = String(p || "").trim().toLowerCase();
        if (x.startsWith("iliad")) return "iliad";
        if (x.startsWith("poste")) return "poste";
        if (x.startsWith("coop")) return "coop";
        if (x.startsWith("tiscali")) return "tiscali";
        return null;
    };
    const ETICHETTA_PROV = { iliad: "Iliad", poste: "PosteMobile", coop: "CoopVoce", tiscali: "Tiscali" };
    const boostDi = (items) => {
        const m = new Map();
        let pt = 0, pz = 0;
        for (const it of items) {
            const b = Number(it.boostProv || 0);
            if (!b) continue;
            const f = famigliaProv(it.provenienza) || "altri";
            const r = m.get(f) || { pt: 0, pz: 0 };
            r.pt = Math.round((r.pt + b) * 100) / 100; r.pz++;
            m.set(f, r);
            pt = Math.round((pt + b) * 100) / 100; pz++;
        }
        return { pt, pz, per: [...m.entries()].sort((a, b) => b[1].pt - a[1].pt) };
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
                                        <div className="shrink-0 flex flex-col items-center gap-1.5">
                                            <Donut size={118} spessore={13} unit={aPunti ? "punti" : "pezzi"} slices={slices.length ? slices : [{ label: g.nome, colore: "rgba(255,255,255,.12)", val: 1, det: [] }]}
                                                centro={<><span className="text-base font-black text-white tabular-nums leading-none">{aPunti ? fmtPt(g.val) : fmtN(g.val)}</span><span className="text-[8px] text-slate-500 uppercase mt-0.5">{aPunti ? "pt" : "pz"}</span></>} />
                                            {(() => {
                                                const b = boostDi(g.items);
                                                if (!b.pz) return null;
                                                return (
                                                    <div className="flex flex-col items-center" title={`Boost MNP: ${b.per.map(([f, r]) => `${ETICHETTA_PROV[f] || "altri"} ${fmtN(r.pz)} pz = +${fmtPt(r.pt)} pt`).join(" · ")}`}>
                                                        <Donut size={62} spessore={8} unit="punti"
                                                            slices={b.per.map(([f, r]) => ({ label: ETICHETTA_PROV[f] || "Altri", colore: COLORI_PROV[f] || "#94a3b8", val: r.pt, det: [{ l: "pezzi", r: fmtN(r.pz) }, { l: "extra", r: `+${fmtPt(r.pt)} pt` }] }))}
                                                            centro={<span className="text-[11px] font-black tabular-nums leading-none" style={{ color: "#f97316" }}>+{fmtPt(b.pt)}</span>} />
                                                        <p className="text-[8px] uppercase tracking-wider text-slate-500 mt-0.5">boost MNP</p>
                                                        <p className="text-[8px] text-slate-600 leading-tight text-center max-w-[92px]">
                                                            {b.per.map(([f, r]) => `${ETICHETTA_PROV[f] || "altri"} ${fmtN(r.pz)}`).join(" · ")}
                                                        </p>
                                                    </div>
                                                );
                                            })()}
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
                {gruppi.some((g) => boostDi(g.items).pz > 0) && (
                    <p className="text-[10px] text-slate-500 mt-3 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: "#f97316" }} /> l&apos;anello piccolo è il <b className="text-slate-400">punteggio extra +1</b> che la lettera dà alle MNP da <b className="text-slate-400">Iliad, CoopVoce, PosteMobile, Tiscali</b> — è già dentro i punti dell&apos;anello grande</span>
                    </p>
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
                gamification»): le fette sono le SORGENTI dei punti, hover =
                dettaglio, click sull'anello = ANALISI ESPLOSA, lente 🔍 =
                elenco contratti, countUp al centro e delta vs mese scorso. */}
            {contatori.length > 0 && (
                <div className="grid gap-3 mb-4 justify-items-center grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-6">
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
                                onClick={(e) => { e.stopPropagation(); setAnalisi(ct); }}
                                className="flex flex-col items-center gap-1 cursor-pointer group select-none"
                                title="Clicca per l'analisi della pista: sottogruppi e spaccato per offerta">
                                <div className="transition-transform duration-200 group-hover:scale-[1.05]">
                                    <Donut size={size >= 6 ? 126 : 112} spessore={13} unit={ct.unit === "pt" ? "punti" : "pezzi"} slices={slices}
                                        centro={<>
                                            <span className="text-lg font-black text-white tabular-nums leading-none"><Num v={ct.val} punti={ct.unit === "pt"} /></span>
                                            <span className="text-[8px] text-slate-500 uppercase tracking-wider mt-0.5">{ct.unit === "pt" ? "punti" : "pezzi"}</span>
                                        </>} />
                                </div>
                                <div className="text-[10px] font-bold text-slate-200 flex items-center gap-1.5">
                                    <span>{ct.emoji} {ct.label}</span>
                                    {ctx.confronto && ct.val !== ct.prevVal && <Delta v={Math.round((ct.val - ct.prevVal) * 100) / 100} />}
                                    <button onClick={(e) => { e.stopPropagation(); setDrill({ titolo: `${G.label} · pista ${ct.label}`, sub: ctx.etichettaScope || (ctx.persona ? `di ${ctx.persona}` : ctx.negozio), items: ct.items }); }}
                                        className="text-[9px] font-black text-slate-400 border border-white/10 bg-white/[0.04] rounded-md px-1.5 py-0.5 hover:text-white hover:bg-white/[0.1] transition-colors"
                                        title="Elenco contratti della pista">🔍</button>
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

            <div className={cn(brand === "sky" ? "flex gap-4 flex-col @2xl:flex-row @2xl:items-start" : "")}>
                {brand === "sky" && (
                    <div className="shrink-0 mx-auto sm:mx-0">
                        <Donut size={size >= 6 ? 168 : 138} unit="punti"
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
                        {/* «+N» e «oltre» ESPLICITI (Luca 26/08: «non si capisce se i 9
                            sono un di-cui dei 28 o in più»): sono IN PIÙ per costruzione —
                            qui contano solo i pezzi della gara T2 (brandGara fw), questi
                            stanno nella gara Vodafone (brandGara vf, codici T1) */}
                        {t1 > 0 && <Tip tip={<div><TipTitolo>Fastweb su codici T1 — gara separata</TipTitolo><p className="text-[11px] text-slate-300 max-w-[220px]">Sono <b>in più</b>, non un di-cui: i pezzi qui sopra sono solo della gara T2. Questi {t1} sono Fastweb venduti sui codici dei Vodafone Store e contano nella gara Vodafone (lettera A), punti compresi. Clicca per l&apos;elenco.</p></div>}><span onClick={(e) => { e.stopPropagation(); setDrill({ titolo: "Fastweb in gara Vodafone (lettera A)", items: ctx.items.filter((it) => it.brandGara === "vf" && it.fwInA) }); }} className="px-2 py-0.5 rounded-md bg-yellow-400/10 border border-yellow-400/25 text-[10px] text-yellow-200 cursor-pointer hover:bg-yellow-400/20">🟨 +{t1} oltre questi · in gara Vodafone</span></Tip>}
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
        // S4: la categoria è un contenitore unico («Energia») — la differenza
        // vera è LUCE vs GAS, che vive nel prodotto (Luca 24/08)
        const gruppoDi = (it) => chiave === "s4"
            ? (/gas/i.test(String(it.prodotto || "")) ? "🔥 Gas" : "💡 Luce")
            : (it.categoria || "Altro");
        const per = new Map();
        for (const it of sue) { const c = gruppoDi(it); (per.get(c) || per.set(c, []).get(c)).push(it); }
        return [...per.entries()].map(([label, items2]) => ({ label, items: items2 })).sort((a, b) => b.items.length - a.items.length);
    }, [sue, chiave]);
    const COLORI = ["#818cf8", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6", "#f97316", "#e879f9", "#64748b"];
    // S4 è VERDE (Luca 24/08: «dovevi farlo su una scala di verdi»):
    // luce = lime brillante, gas = teal scuro — famiglia del brand
    const coloreRiga = (label, i) => label === "💡 Luce" ? "#a3e635" : label === "🔥 Gas" ? "#14b8a6" : COLORI[i % COLORI.length];
    if (!sue.length) return (
        <div className="flex items-center gap-3 py-6 justify-center text-slate-500 text-xs">
            <LogoBrand chiave={chiave} h={20} /> nessuna vendita {nome} nel periodo
        </div>
    );
    return (
        <div>
            <p className="text-[10px] text-slate-500 mb-3 tabular-nums">{fmtN(sue.length)} pezzi <span className="text-slate-600">· fuori dalle gare a punti: si conta a pezzi</span></p>
            <div className="flex gap-4 flex-col @2xl:flex-row @2xl:items-start">
                <div className="shrink-0 mx-auto sm:mx-0">
                    <Donut size={size >= 6 ? 160 : 132} unit="pezzi"
                        slices={righe.map((r, i) => ({
                            label: r.label, colore: coloreRiga(r.label, i), val: r.items.length,
                            det: Object.entries(r.items.reduce((m, it) => { const k = String(it.offerta || it.prodotto || "—").slice(0, 26); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, q]) => ({ l: p, r: fmtN(q) })),
                        }))}
                        centro={<><span className="text-2xl font-black text-white tabular-nums leading-none"><Num v={sue.length} punti={false} /></span><span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">pezzi</span></>} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                    {righe.map((r, i) => (
                        <Tip key={r.label} block tip={<div>
                            <TipTitolo>{r.label}</TipTitolo>
                            <TipRiga l="pezzi" r={fmtN(r.items.length)} colore={coloreRiga(r.label, i)} />
                            {Object.entries(r.items.reduce((m, it) => { const k = String(it.offerta || it.prodotto || "—").slice(0, 28); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, q]) => <TipRiga key={p} l={p} r={fmtN(q)} />)}
                            <p className="text-[10px] text-indigo-300 mt-1">👆 clicca per l'elenco contratti</p>
                        </div>}>
                            <div onClick={(e) => { e.stopPropagation(); setDrill({ titolo: `${nome} · ${r.label}`, items: r.items }); }}
                                className="grid grid-cols-[minmax(110px,1.2fr)_2fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors cursor-pointer">
                                <span className="text-xs font-semibold text-slate-200 truncate">{r.label}</span>
                                <span className="h-2 rounded-full bg-white/5 overflow-hidden">
                                    <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, (r.items.length / sue.length) * 100)}%`, background: `linear-gradient(90deg, ${coloreRiga(r.label, i)}55, ${coloreRiga(r.label, i)})` }} />
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
        return Object.entries(per).sort((a, b) => b[1].val - a[1].val).slice(0, size >= 6 ? 10 : 6);
    }, [righe, size]);
    const perGiorno = useMemo(() => {
        const v = Array.from({ length: ctx.nG }, (_, i) => ({ n: i + 1, label: ctx.labels?.[i] || `giorno ${i + 1}`, val: 0, det: [], chiuso: !!ctx.chiusi?.[i] }));
        for (const r of righe) if (r.g >= 1 && r.g <= ctx.nG) { v[r.g - 1].val += valDi(r); }
        v.forEach((d) => { d.val = Math.round(d.val); });
        return v;
    }, [righe, ctx.nG, ctx.labels]);

    if (!righe.length) return <p className="text-xs text-slate-500 py-6 text-center">Nessuna vendita di marginalità nel periodo.</p>;
    return (
        <div className="flex gap-5 flex-col @3xl:flex-row">
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
                {size >= 6 && <div className="mt-3"><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Ritmo del mese (€ venduti)</p><HeatCal giorni={perGiorno} oggi={ctx.oggi > 0 ? ctx.oggi - 1 : -1} colore="#22c55e" unit="€ venduti" /></div>}
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
    // FLUIDO (regola responsive 24/08): l'anello scala con la sua cella —
    // card piccola ~72px, card grande fino a 190px
    return (
        <Tip className="w-full block" tip={tip}>
            <div className="text-center w-full">
                <div className="relative w-full max-w-[170px] min-w-[72px] aspect-square mx-auto grid place-items-center rounded-full transition-transform hover:scale-105 [container-type:inline-size]" style={{ background: `conic-gradient(${colore} ${Math.min(360, perc * 3.6)}deg, rgba(255,255,255,.07) 0deg)`, filter: `drop-shadow(0 0 8px ${colore}44)` }}>
                    <div className="w-[76%] h-[76%] rounded-full bg-[#10132a] grid place-items-center an-scuro">
                        <span className="font-black text-white tabular-nums" style={{ fontSize: "clamp(0.85rem, 22cqw, 1.6rem)" }}>{Math.round(perc)}%</span>
                    </div>
                </div>
                <div className="mt-1 flex justify-center">
                    {logoChiave ? <LogoBrand chiave={logoChiave} alt={label} h={17} />
                        : <p className="text-[10px] text-slate-400 font-semibold max-w-[110px] truncate">{label}</p>}
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
                    {righe.map((r) => <TipRiga key={r.label} l={<>{r.emoji} {r.label}</>} r={b === "fw" ? `${fmtN(r.items.length)} pz` : `${fmtN(r.items.length)} pz · ${fmtPt(somma(r.items))} pt`} colore={r.colore} />)}
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

    // criterio Luca 24/08: un negozio si mostra SOLO con almeno
    // un'attivazione vera (quota > 0 su almeno un anello) — la riga
    // fantasma di una marginalità a 0€ non basta (caso Latina/Promontori)
    // criterio Luca 25/08 (definitivo): il negozio compare SOLO con almeno
    // un CONTRATTO suo lì (gare o altri operatori) — la marginalità da sola
    // non basta (caso Latina@Promontori: un'assistenza da 0,10 € apriva la
    // sezione con tutti gli anelli a zero)
    const haAttivazione = (n) => mio(ctx.itemsRete).some((it) => it.negozio === n) || mio(ctx.altriRete || []).some((it) => it.negozio === n);
    const sezioni = negozi.filter(haAttivazione).map((n) => ({ n, cont: contatoriDi(n) })).slice(0, 4);
    if (!sezioni.length) return <p className="text-xs text-slate-500 py-4 text-center">Nessuna vendita nel periodo.</p>;
    // TAGLIA ADATTIVA AL NUMERO (Luca 25/08): 5 anelli grandi, 10 medi,
    // 30 piccoli — sempre in proporzione alla larghezza della card (cqw)
    const totAnelli = sezioni.reduce((sm, x) => sm + x.cont.length, 0);
    const qw = Math.max(8, Math.min(19, Math.round(90 / Math.max(1, totAnelli))));
    const cella = `clamp(86px, ${qw}cqw, 178px)`;
    return (
        <div className="space-y-4">
            {sezioni.map(({ n, cont }) => (
                <div key={n}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">🏪 {n}</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        {cont.map((c) => <span key={c.label} className="block" style={{ width: cella }}><AnelloPeso {...c} /></span>)}
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
    // a PEZZI la classifica conta TUTTA la produzione: anche S4 e gli
    // altri operatori (Luca 24/08)
    if (metrica === "pezzi") for (const it of (ctx.altriStore || [])) { const k = it.venditore; if (!k || k === "—") continue; (per.get(k) || per.set(k, []).get(k)).push(it); }
    const righe = [...per.entries()].map(([k, its]) => {
        const val = metrica === "pezzi" ? its.length : somma(its.filter((it) => it.brandGara === metrica));
        const altriDet = new Map();
        if (metrica === "pezzi") for (const it of its) { if (it.brandGara) continue; const kk = trkBrandKey(it.brand); if (!kk) continue; const e = altriDet.get(kk) || { l: it.brand, n: 0, c: HEX_BRAND[kk] || "#64748b" }; e.n++; altriDet.set(kk, e); }
        const det = metrica === "pezzi"
            ? [
                ...Object.entries(GARA).map(([b, g]) => { const n = its.filter((it) => it.brandGara === b).length; return n ? { l: g.label, r: `${fmtN(n)} pz`, colore: g.colore } : null; }).filter(Boolean),
                ...[...altriDet.values()].map((e) => ({ l: e.l, r: `${fmtN(e.n)} pz`, colore: e.c })),
            ]
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
/* ═══ MIX OPERATORI v2 (Luca 24/08: «una cosa più bella, esteticamente,
   interattiva») — anello vivo: % sulle fette, hover sincronizzato
   fetta ⇄ riga (le altre si attenuano, il centro diventa il brand),
   righe con barra di riempimento % nel colore del brand, click = 📌
   blocca il brand e sotto compaiono le sue sorgenti. ═══════════════════ */
function WidgetMixPezzi({ ctx }) {
    const [hl, setHl] = useState(null);
    const [pin, setPin] = useState(null);
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, []);
    useEffect(() => { setPin(null); setHl(null); }, [ctx.persona, ctx.negozio, ctx.areaKey]);
    // MIX COMPLETO (Luca 24/08: «S4 non viene considerato nemmeno nel
    // mix»): le fette sono i 4 brand in gara PIÙ gli altri operatori
    // (S4, TIM, Very…) — il mix è di TUTTE le vendite, non solo di gara
    const perAltro = new Map();
    for (const rr of (ctx.altri || [])) {
        const kk = trkBrandKey(rr.brand);
        if (!kk) continue;
        const e = perAltro.get(kk) || { k: kk, label: rr.brand, sue: [] };
        e.sue.push(rr); perAltro.set(kk, e);
    }
    const altriBrand = [...perAltro.values()];
    const tot = ctx.items.length + altriBrand.reduce((sm, x) => sm + x.sue.length, 0);
    let acc = 0;
    const fette = [
        ...Object.entries(GARA).map(([b, g]) => ({ b, g, sue: ctx.items.filter((it) => it.brandGara === b), gara: true })),
        ...altriBrand.map((x) => ({ b: `alt:${x.k}`, g: { label: x.label, colore: HEX_BRAND[x.k] || "#64748b", chiave: TRK_BRAND_LOGOS[x.k] ? x.k : null }, sue: x.sue, gara: false })),
    ].filter((x) => x.sue.length > 0)
        .map((x) => ({ ...x, f: tot > 0 ? x.sue.length / tot : 0, pct: tot > 0 ? Math.round((x.sue.length / tot) * 100) : 0 }))
        .map((x) => { const o = acc; acc += x.f; return { ...x, o }; });
    const att = fette.find((x) => x.b === (hl || pin)) || null;
    const size = 186, r = 70, sw = 18, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
    const dett = att ? (att.gara ? righeOperatore(att.b, att.sue).slice(0, 4) : (() => {
        const m = new Map();
        for (const it of att.sue) { const kk = String(it.prodotto || it.categoria || "—").slice(0, 22); (m.get(kk) || m.set(kk, []).get(kk)).push(it); }
        return [...m.entries()].map(([label, arr]) => ({ emoji: "•", label, items: arr, colore: att.g.colore })).sort((a, b2) => b2.items.length - a.items.length).slice(0, 4);
    })()) : [];
    return (
        <div className="tf-mix w-full h-full min-h-0 select-none">
            <div className="tf-mix-anello">
            <div className="relative aspect-square h-full w-full max-h-[290px] max-w-[290px] min-h-[176px] min-w-[176px] mx-auto">
                <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ overflow: "visible" }}>
                    <g transform={`translate(${cx},${cy})`}>
                        <circle r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={sw} />
                        <g transform="rotate(-90)">
                            {fette.map((x) => {
                                const attiva = (hl || pin) === x.b;
                                const spenta = (hl || pin) && !attiva;
                                return (
                                    <circle key={x.b} r={r} fill="none" stroke={x.g.colore} strokeLinecap="butt"
                                        strokeWidth={attiva ? sw + 6 : sw}
                                        strokeDasharray={`${on ? Math.max(0.001, x.f * C - (fette.length > 1 ? 2.5 : 0)) : 0.001} ${C}`}
                                        strokeDashoffset={-(x.o * C)}
                                        pointerEvents="stroke" className="cursor-pointer"
                                        onMouseEnter={() => setHl(x.b)} onMouseLeave={() => setHl(null)}
                                        onClick={() => setPin((pv) => (pv === x.b ? null : x.b))}
                                        style={{
                                            transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1), stroke-width .2s, opacity .25s",
                                            opacity: spenta ? 0.28 : 1,
                                            filter: attiva ? `drop-shadow(0 0 7px ${x.g.colore}AA)` : `drop-shadow(0 0 3px ${x.g.colore}33)`,
                                        }} />
                                );
                            })}
                        </g>
                        {/* % sulle fette larghe: le piccole parlano via hover e righe */}
                        {on && fette.filter((x) => x.f >= 0.08).map((x) => {
                            const th = (x.o + x.f / 2) * 2 * Math.PI - Math.PI / 2;
                            return (
                                <text key={x.b} x={Math.cos(th) * r} y={Math.sin(th) * r} textAnchor="middle" dominantBaseline="central"
                                    className="pointer-events-none" fill="#fff" fontSize="10" fontWeight="900"
                                    style={{ paintOrder: "stroke", stroke: "rgba(10,12,28,.75)", strokeWidth: 3, opacity: (hl || pin) && (hl || pin) !== x.b ? 0.3 : 1, transition: "opacity .25s" }}>
                                    {x.pct}%
                                </text>
                            );
                        })}
                    </g>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    {att ? (
                        <>
                            {att.g.chiave ? <LogoBrand chiave={att.g.chiave} h={14} /> : <span className="w-3 h-3 rounded-full" style={{ background: att.g.colore }} />}
                            <span className="text-[26px] font-black tabular-nums leading-none mt-1" style={{ color: att.g.colore, textShadow: `0 0 18px ${att.g.colore}66` }}>{att.pct}%</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 tabular-nums">{fmtN(att.sue.length)} pezzi{pin === att.b ? " · 📌" : ""}</span>
                        </>
                    ) : (
                        <>
                            <span className="text-2xl font-black text-white tabular-nums leading-none"><Num v={tot} punti={false} /></span>
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">pezzi totali</span>
                        </>
                    )}
                </div>
            </div>
            </div>
            <div className="tf-mix-righe flex flex-col gap-2 w-full max-w-[340px] min-w-0">
            <div className="w-full flex flex-col gap-1">
                {fette.map((x) => {
                    const attiva = (hl || pin) === x.b;
                    return (
                        <div key={x.b} onMouseEnter={() => setHl(x.b)} onMouseLeave={() => setHl(null)}
                            onClick={() => setPin((pv) => (pv === x.b ? null : x.b))}
                            title={pin === x.b ? "Sblocca" : "Clicca per bloccare il dettaglio"}
                            className={cn("relative rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all overflow-hidden",
                                attiva ? "border-white/25 bg-white/[0.07]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
                                pin && pin !== x.b && !hl ? "opacity-45" : "")}>
                            <div className="absolute inset-y-0 left-0" style={{ width: on ? `${x.pct}%` : "0%", background: `linear-gradient(90deg, ${x.g.colore}3d, ${x.g.colore}08)`, transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} />
                            <div className="relative flex items-center gap-2">
                                {x.g.chiave ? <LogoBrand chiave={x.g.chiave} h={12} /> : <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: x.g.colore }} />}
                                <span className="text-[11px] font-bold text-slate-200 flex-1 truncate">{x.g.label}</span>
                                <span className="text-[10px] text-slate-500 tabular-nums">{fmtN(x.sue.length)} pz</span>
                                <span className="text-[13px] font-black tabular-nums w-10 text-right" style={{ color: x.g.colore }}>{x.pct}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="w-full h-[52px] flex flex-wrap content-center justify-center gap-1 overflow-hidden">
                {att && dett.map((rg) => (
                    <span key={rg.label} className="flex items-center gap-1 text-[9px] text-slate-300 px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/10">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: rg.colore || att.g.colore }} />
                        {rg.emoji} {rg.label} · <b className="text-slate-100 tabular-nums">{fmtN(rg.items.length)}</b>
                    </span>
                ))}
                {!att && <span className="text-[9px] text-slate-600">passa sull'anello o sulle righe · click per bloccare</span>}
            </div>
            </div>
        </div>
    );
}

/* ═══ MIX PERSONE DEL PUNTO VENDITA (Luca 28/08: «chi è che sta producendo
   di più su quel punto vendita, diviso per ogni brand — e poi un anello
   generale di produzione totale») — gemello del Mix operatori, ma le fette
   sono le PERSONE. Il colore appartiene alla persona e NON cambia da un
   anello all'altro: passi su Denise e la vedi accendersi ovunque, così il
   suo peso brand per brand si legge in un colpo d'occhio.
   STILE (Luca 28/08, secondo giro): niente anelli nuovi — si riusano quelli
   che il CRM ha già. L'anello grande è quello del Mix operatori (stessa
   misura, stesso stacco tra le fette, stessa aura, % sulle fette larghe);
   gli anelli per brand sono quelli di «Il mio peso nei negozi» (disco a
   conic-gradient, cerchio scuro dentro, logo sotto, tooltip di casa).
   Vive SOLO nell'area Negozio e guarda sempre la SQUADRA INTERA: il filtro
   collaboratore qui non si applica (con un nome solo il mix non esiste).
   L'anello generale è in PEZZI — mai punti sommati tra operatori (regola
   cardine); i punti si accendono con lo switch e valgono DENTRO il brand.
   Il totale coincide con quello del Mix operatori: stessa base (gara +
   altri operatori), «non assegnato» compreso — se sparisse, i due anelli
   direbbero due numeri diversi sulla stessa produzione. ════════════════ */
// tavolozza assegnata per POSIZIONE in classifica: due persone non possono
// mai pescare lo stesso colore e il primo produttore ha sempre lo stesso
// indaco. Da qui il tetto: oltre la tavolozza la coda si raccoglie in
// «Altri», altrimenti due nomi finirebbero con lo stesso identico colore in
// ogni anello (caso reale con «Tutti i negozi» selezionati).
const PALETTE_PERSONE = ["#818cf8", "#f472b6", "#22d3ee", "#fbbf24", "#34d399", "#a78bfa", "#fb7185", "#38bdf8", "#a3e635", "#fb923c", "#2dd4bf", "#e879f9"];
const MAX_PERSONE = PALETTE_PERSONE.length;
const COL_ALTRI = "#94a3b8";     // il mucchio oltre la tavolozza
const COL_ORFANO = "#475569";    // vendite senza venditore
const COL_IGNOTO = "#64748b";    // brand senza colore suo
const pcQ = (q) => (q > 0 && q < 0.005 ? "<1" : String(Math.round(q * 100)));
const primoNome = (n) => String(n || "").trim().split(/\s+/)[0] || "—";

function WidgetMixPersone({ ctx }) {
    const [hl, setHl] = useState(null);
    const [pin, setPin] = useState(null);
    const [unita, setUnita] = useState("pezzi");
    const [brandSel, setBrandSel] = useState(null);   // null = tutti i marchi
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, []);
    // niente reset a mano di hl/pin: la griglia dell'area Negozio è keyata su
    // negozi + collaboratore + periodo, quindi al cambio si rimonta da sola

    const { persone, brands, totPezzi, nSquadra, conPunti } = useMemo(() => {
        // le vendite si appiattiscono PRIMA in righe nostre (nome, brand,
        // punti): dopo si accumula solo su oggetti locali, mai sui dati che
        // arrivano dal contesto
        const righe = [
            ...(ctx.itemsStore || []).map((it) => {
                const g = GARA[it.brandGara];
                return g ? { nome: it.venditore || "—", bk: it.brandGara, label: g.label, colore: g.colore, chiave: g.chiave, gara: true, punti: Number(it.punti) || 0 } : null;
            }),
            // il mix è di TUTTA la produzione, non solo di gara: S4, TIM, Very…
            ...(ctx.altriStore || []).map((it) => {
                const kk = trkBrandKey(it.brand);
                return kk ? { nome: it.venditore || "—", bk: `alt:${kk}`, label: it.brand, colore: HEX_BRAND[kk] || COL_IGNOTO, chiave: TRK_BRAND_LOGOS[kk] ? kk : null, gara: false, punti: Number(it.punti) || 0 } : null;
            }),
        ].filter(Boolean);
        const P = new Map(), B = new Map();
        for (const r of righe) {
            // si raggruppa sul nome NORMALIZZATO: due grafie dello stesso nome
            // ("Denise Rossi" e "denise rossi ") sono una persona sola — e non
            // due righe con la stessa chiave React
            const kp = r.nome === "—" ? "__nessuno" : norm(r.nome);
            let p = P.get(kp);
            if (!p) { p = { k: kp, nome: r.nome, pezzi: 0, per: new Map() }; P.set(kp, p); }
            p.pezzi++;
            let e = p.per.get(r.bk);
            if (!e) { e = { pezzi: 0, punti: 0 }; p.per.set(r.bk, e); }
            e.pezzi++; e.punti += r.punti;
            let b = B.get(r.bk);
            if (!b) { b = { k: r.bk, label: r.label, colore: r.colore, chiave: r.chiave, gara: r.gara, pezzi: 0, punti: 0 }; B.set(r.bk, b); }
            b.pezzi++; b.punti += r.punti;
        }
        const veri = [...P.values()].filter((p) => p.k !== "__nessuno")
            .sort((a, b) => b.pezzi - a.pezzi || String(a.nome).localeCompare(String(b.nome), "it"));
        const testa = veri.slice(0, MAX_PERSONE), coda = veri.slice(MAX_PERSONE);
        const fondo = [];
        if (coda.length) {
            const per = new Map();
            let pezzi = 0;
            for (const p of coda) {
                pezzi += p.pezzi;
                for (const [bk, e] of p.per) {
                    let t = per.get(bk);
                    if (!t) { t = { pezzi: 0, punti: 0 }; per.set(bk, t); }
                    t.pezzi += e.pezzi; t.punti += e.punti;
                }
            }
            fondo.push({ k: "__altri", pezzi, per, colore: COL_ALTRI, label: `Altri (${coda.length})`, breve: "Altri" });
        }
        const orfani = P.get("__nessuno");
        if (orfani) fondo.push({ ...orfani, colore: COL_ORFANO, label: "Non assegnato", breve: "n.a." });
        const ordinate = [
            ...testa.map((p, i) => ({ ...p, colore: PALETTE_PERSONE[i], label: p.nome, breve: primoNome(p.nome) })),
            ...fondo,
        ];
        // brand nell'ordine di sempre (W3, VF, Fastweb, Sky) e poi gli altri
        // operatori per volume
        const ordineGara = Object.keys(GARA);
        const brandOrd = [...B.values()].sort((a, b) => {
            const ia = a.gara ? ordineGara.indexOf(a.k) : 99, ib = b.gara ? ordineGara.indexOf(b.k) : 99;
            return ia - ib || b.pezzi - a.pezzi;
        });
        return {
            persone: ordinate, brands: brandOrd,
            totPezzi: ordinate.reduce((s, p) => s + p.pezzi, 0),
            nSquadra: veri.length,
            conPunti: brandOrd.some((b) => b.punti > 0),
        };
    }, [ctx.itemsStore, ctx.altriStore]);

    const attivo = hl || pin;
    const att = persone.find((p) => p.k === attivo) || null;
    if (!totPezzi) return <p className="text-xs text-slate-500 py-4 text-center">Nessuna vendita nel periodo.</p>;

    // FILTRO BRAND (Luca 28/08: «dammi anche la possibilità di filtrare per
    // brand: a quel punto di quel brand mi dici qual è lo spaccato delle
    // persone»). Il widget gira nei due sensi: scelto un marchio, l'anello
    // grande e le righe diventano i SUOI e sotto gli anelli non sono più i
    // brand ma le PERSONE che lo fanno.
    const bSel = brands.find((b) => b.k === brandSel) || null;
    // dentro UN SOLO brand i punti sono leciti ovunque, anello grande compreso:
    // la regola cardine vieta di sommarli TRA operatori, non dentro l'operatore
    const puntiBig = !!bSel && unita === "punti" && bSel.punti > 0;
    const totBig = bSel ? (puntiBig ? bSel.punti : bSel.pezzi) : totPezzi;
    const unitBig = puntiBig ? "pt" : "pz";
    const fmtBig = (v) => (puntiBig ? fmtPt(v) : fmtN(v));

    // ── anello GENERALE: identico a quello del Mix operatori ──────────────
    const size = 186, R = 70, SW = 18, C = 2 * Math.PI * R, cx = size / 2, cy = size / 2;
    const fette = [];
    let acc = 0;
    for (const p of persone) {
        const e = bSel ? p.per.get(bSel.k) : null;
        const v = bSel ? (e ? (puntiBig ? e.punti : e.pezzi) : 0) : p.pezzi;
        if (v <= 0) continue;
        const f = totBig > 0 ? v / totBig : 0;
        fette.push({ ...p, v, f, o: acc, pct: pcQ(f) });
        acc += f;
    }
    const attF = fette.find((x) => x.k === attivo) || null;
    const nNegozi = ctx.negozi?.length || 1;

    // ── gli anelli di sotto: uno per BRAND, o uno per PERSONA se filtrato ──
    const perBrand = brands.map((b) => {
        // i punti valgono solo dentro il brand che li ha (Fastweb T2 e gli
        // altri operatori non ne hanno: restano a pezzi anche con lo switch)
        const punti = unita === "punti" && b.punti > 0;
        const tot = punti ? b.punti : b.pezzi;
        const quote = persone.map((p) => {
            const e = p.per.get(b.k);
            const v = e ? (punti ? e.punti : e.pezzi) : 0;
            return { k: p.k, colore: p.colore, label: p.label, breve: p.breve, v, q: tot > 0 ? v / tot : 0 };
        }).filter((x) => x.v > 0);
        return { b, tot, punti, quote, capo: quote.reduce((m, x) => (!m || x.v > m.v ? x : m), null) };
    }).filter((x) => x.tot > 0 && x.quote.length);
    // stessa regola di taglia degli anelli di «peso nei negozi»: pochi grandi,
    // tanti piccoli, sempre in proporzione alla larghezza della card
    const nGiu = bSel ? fette.length : perBrand.length;
    const cella = `clamp(84px, ${Math.max(8, Math.min(16, Math.round(88 / Math.max(1, nGiu))))}cqw, 150px)`;

    return (
        <div className="w-full select-none flex flex-col gap-3">
            {/* BARRA DI COMANDO IN CIMA (Luca 28/08: «i brand posizionali sopra
                da qualche parte, così come il button per lo switch tra pz e
                pt»): filtro per marchio e unità comandano TUTTO il widget —
                l'anello grande, le righe e gli anelli di sotto — quindi stanno
                in testa, non in fondo a quello che governano. */}
            <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
                <div className="flex items-center gap-1 flex-wrap min-w-0">
                    <button onClick={() => setBrandSel(null)} title="Tutti i marchi"
                        className={cn("px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors",
                            bSel ? "border-white/10 bg-white/[0.03] text-slate-500 hover:bg-white/[0.06]" : "border-white/25 bg-white/15 text-white")}>
                        Tutti
                    </button>
                    {brands.map((b) => (
                        <button key={b.k} onClick={() => setBrandSel((v) => (v === b.k ? null : b.k))} title={`Solo ${b.label}`}
                            className={cn("px-2 py-1 rounded-lg border transition-all flex items-center",
                                brandSel === b.k ? "border-white/30 bg-white/15" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] opacity-70 hover:opacity-100")}>
                            {b.chiave ? <LogoBrand chiave={b.chiave} colore={brandSel === b.k ? b.colore : null} alt={b.label} h={17} />
                                : <span className="text-[10px] font-bold text-slate-300 px-1">{b.label}</span>}
                        </button>
                    ))}
                </div>
                {conPunti && (
                    <span className="shrink-0 inline-flex rounded-lg border border-white/10 overflow-hidden">
                        {["pezzi", "punti"].map((u) => (
                            <button key={u} onClick={() => setUnita(u)} title={u === "pezzi" ? "A pezzi" : "A punti (dove esistono)"}
                                className={cn("px-2.5 py-1 text-[10px] font-bold transition-colors", unita === u ? "bg-white/15 text-white" : "text-slate-500 hover:text-slate-300")}>
                                {u === "pezzi" ? "pz" : "pt"}
                            </button>
                        ))}
                    </span>
                )}
            </div>
            <div className="tf-mixp">
                <div className="tf-mixp-anello">
                    <div className="relative aspect-square w-full mx-auto">
                        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ overflow: "visible" }}>
                            <g transform={`translate(${cx},${cy})`}>
                                <circle r={R} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={SW} />
                                <g transform="rotate(-90)">
                                    {fette.map((x) => {
                                        const attiva = attivo === x.k, spenta = attivo && !attiva;
                                        return (
                                            <circle key={x.k} r={R} fill="none" stroke={x.colore} strokeLinecap="butt"
                                                strokeWidth={attiva ? SW + 6 : SW}
                                                strokeDasharray={`${on ? Math.max(0.001, x.f * C - (fette.length > 1 ? 2.5 : 0)) : 0.001} ${C}`}
                                                strokeDashoffset={-(x.o * C)}
                                                pointerEvents="stroke" className="cursor-pointer"
                                                onMouseEnter={() => setHl(x.k)} onMouseLeave={() => setHl(null)}
                                                onClick={() => setPin((v) => (v === x.k ? null : x.k))}
                                                style={{
                                                    transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1), stroke-width .2s, opacity .25s",
                                                    opacity: spenta ? 0.28 : 1,
                                                    filter: attiva ? `drop-shadow(0 0 7px ${x.colore}AA)` : `drop-shadow(0 0 3px ${x.colore}33)`,
                                                }} />
                                        );
                                    })}
                                </g>
                                {/* % sulle fette larghe: le piccole parlano via hover e righe */}
                                {on && fette.filter((x) => x.f >= 0.08).map((x) => {
                                    const th = (x.o + x.f / 2) * 2 * Math.PI - Math.PI / 2;
                                    return (
                                        <text key={x.k} x={Math.cos(th) * R} y={Math.sin(th) * R} textAnchor="middle" dominantBaseline="central"
                                            className="pointer-events-none" fill="#fff" fontSize="10" fontWeight="900"
                                            style={{ paintOrder: "stroke", stroke: "rgba(10,12,28,.75)", strokeWidth: 3, opacity: attivo && attivo !== x.k ? 0.3 : 1, transition: "opacity .25s" }}>
                                            {x.pct}%
                                        </text>
                                    );
                                })}
                            </g>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            {att ? (
                                <>
                                    <span className="w-3 h-3 rounded-full" style={{ background: att.colore }} />
                                    <span className="text-[26px] font-black tabular-nums leading-none mt-1" style={{ color: att.colore, textShadow: `0 0 18px ${att.colore}66` }}>{attF ? attF.pct : "0"}%</span>
                                    <span className="text-[10px] font-bold text-slate-200 mt-1 truncate max-w-[85%]">{att.label}</span>
                                    <span className="text-[9px] text-slate-500 mt-0.5 tabular-nums">{fmtBig(attF ? attF.v : 0)} {unitBig === "pt" ? "punti" : "pezzi"}{bSel ? ` · ${bSel.label}` : ""}{pin === att.k ? " · 📌" : ""}</span>
                                </>
                            ) : (
                                <>
                                    {bSel?.chiave && <LogoBrand chiave={bSel.chiave} colore={bSel.colore} alt={bSel.label} h={20} className="mb-1" />}
                                    <span className="text-2xl font-black text-white tabular-nums leading-none">{on ? fmtBig(totBig) : "0"}</span>
                                    <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">
                                        {bSel ? (unitBig === "pt" ? "punti" : "pezzi") : (nNegozi > 1 ? `pezzi · ${nNegozi} negozi` : "pezzi del negozio")}
                                    </span>
                                    <span className="text-[9px] text-slate-600 mt-0.5">{bSel ? `${fette.length} ${fette.length === 1 ? "persona" : "persone"}` : `${nSquadra} in squadra`}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="tf-mixp-righe flex flex-col gap-2 w-full max-w-[340px] min-w-0">
                    <div className="w-full flex flex-col gap-1">
                        {fette.map((x) => {
                            const attiva = attivo === x.k;
                            const io = !!ctx.persona && x.k === norm(ctx.persona);
                            return (
                                <div key={x.k} onMouseEnter={() => setHl(x.k)} onMouseLeave={() => setHl(null)}
                                    onClick={() => setPin((v) => (v === x.k ? null : x.k))}
                                    title={pin === x.k ? "Sblocca" : "Clicca per bloccare la persona"}
                                    className={cn("relative rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all overflow-hidden",
                                        attiva ? "border-white/25 bg-white/[0.07]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
                                        io && !attiva ? "ring-1 ring-indigo-400/40" : "",
                                        pin && pin !== x.k && !hl ? "opacity-45" : "")}>
                                    <div className="absolute inset-y-0 left-0" style={{ width: on ? `${x.f * 100}%` : "0%", background: `linear-gradient(90deg, ${x.colore}3d, ${x.colore}08)`, transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} />
                                    <div className="relative flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: x.colore, boxShadow: `0 0 6px ${x.colore}88` }} />
                                        <span className="text-[11px] font-bold text-slate-200 flex-1 truncate">{x.label}</span>
                                        <span className="text-[10px] text-slate-500 tabular-nums">{fmtBig(x.v)} {unitBig}</span>
                                        <span className="text-[13px] font-black tabular-nums w-10 text-right" style={{ color: x.colore }}>{x.pct}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="w-full min-h-[34px] flex flex-wrap content-center justify-center gap-1">
                        {att ? brands.map((b) => {
                            const e = att.per.get(b.k); if (!e) return null;
                            return (
                                <span key={b.k} onClick={() => setBrandSel((v) => (v === b.k ? null : b.k))}
                                    title={`Filtra su ${b.label}`}
                                    className={cn("flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors",
                                        brandSel === b.k ? "text-white bg-white/15 border-white/25" : "text-slate-300 bg-white/[0.05] border-white/10 hover:bg-white/10")}>
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: b.colore }} />
                                    {b.label} · <b className="text-slate-100 tabular-nums">{fmtN(e.pezzi)}</b> pz
                                    {e.punti > 0 && <span className="text-slate-500 tabular-nums">· {fmtPt(e.punti)} pt</span>}
                                </span>
                            );
                        }) : <span className="text-[9px] text-slate-600">passa su una persona: si accende in ogni anello · click per bloccare · scegli un marchio per vedere solo il suo</span>}
                    </div>
                </div>
            </div>

            {/* ── SOTTO: gli anelli. Senza filtro uno per BRAND (al centro chi
                comanda), con un marchio scelto uno per PERSONA ────────────── */}
            <div className="shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate mb-2">
                    {bSel ? `chi fa ${bSel.label}` : "chi comanda su ogni brand"}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    {bSel
                        // ── un anello per PERSONA del marchio scelto ──────────
                        ? fette.map((x) => {
                            const spenta = attivo && attivo !== x.k;
                            return (
                                <span key={x.k} className="block" style={{ width: cella }}>
                                    <Tip className="w-full block" tip={
                                        <div>
                                            <TipTitolo>{x.label} · {bSel.label}</TipTitolo>
                                            <TipRiga l={unitBig === "pt" ? "punti" : "pezzi"} r={`${fmtBig(x.v)} su ${fmtBig(totBig)}`} colore={x.colore} />
                                            <TipRiga l="quota" r={`${x.pct}%`} />
                                            <TipRiga l="su tutto il negozio" r={`${fmtN(x.pezzi)} pz`} />
                                        </div>
                                    }>
                                        <div className="text-center w-full cursor-pointer" onMouseEnter={() => setHl(x.k)} onMouseLeave={() => setHl(null)}
                                            onClick={() => setPin((v) => (v === x.k ? null : x.k))}
                                            style={{ opacity: spenta ? 0.45 : 1, transition: "opacity .25s" }}>
                                            <div className="relative w-full max-w-[150px] min-w-[72px] aspect-square mx-auto grid place-items-center rounded-full transition-transform hover:scale-105 [container-type:inline-size]"
                                                style={{ background: `conic-gradient(${x.colore} ${Math.min(360, x.f * 360)}deg, rgba(255,255,255,.07) 0deg)`, filter: `drop-shadow(0 0 8px ${x.colore}44)` }}>
                                                <div className="w-[76%] h-[76%] rounded-full bg-[#10132a] grid place-items-center an-scuro">
                                                    <span className="font-black tabular-nums" style={{ fontSize: "clamp(0.8rem, 22cqw, 1.5rem)", color: x.colore }}>{x.pct}%</span>
                                                </div>
                                            </div>
                                            <p className="mt-1.5 text-[11px] font-bold truncate" style={{ color: x.colore }}>{x.breve}</p>
                                            <p className="text-[9px] text-slate-500 tabular-nums">{fmtBig(x.v)} {unitBig}</p>
                                        </div>
                                    </Tip>
                                </span>
                            );
                        })
                        // ── un anello per BRAND, al centro la quota di chi comanda ──
                        : perBrand.map(({ b, tot, punti, quote, capo }) => {
                            const mostra = att ? (quote.find((x) => x.k === att.k) || null) : capo;
                            const colore = mostra ? mostra.colore : COL_IGNOTO;
                            // disco a spicchi: stessa scocca dell'anello di «peso nei
                            // negozi», con una fetta per persona invece di una sola
                            const stop = [];
                            let g = 0;
                            for (const x of quote) {
                                const g2 = g + x.q * 360;
                                stop.push(`${attivo && attivo !== x.k ? `${x.colore}33` : x.colore} ${g}deg ${g2}deg`);
                                g = g2;
                            }
                            return (
                                <span key={b.k} className="block" style={{ width: cella }}>
                                    <Tip className="w-full block" tip={
                                        <div>
                                            <TipTitolo>{b.label}</TipTitolo>
                                            <TipRiga l="totale" r={punti ? `${fmtPt(tot)} pt` : `${fmtN(tot)} pz`} />
                                            {quote.map((x) => <TipRiga key={x.k} l={x.label} r={`${punti ? fmtPt(x.v) + " pt" : fmtN(x.v) + " pz"} · ${pcQ(x.q)}%`} colore={x.colore} />)}
                                            <TipRiga l="" r="click: solo questo marchio" />
                                        </div>
                                    }>
                                        <div className="text-center w-full cursor-pointer" onClick={() => setBrandSel(b.k)} title={`Solo ${b.label}`}>
                                            <div className="relative w-full max-w-[150px] min-w-[72px] aspect-square mx-auto grid place-items-center rounded-full transition-transform hover:scale-105 [container-type:inline-size]"
                                                style={{ background: `conic-gradient(${stop.join(", ")})`, filter: `drop-shadow(0 0 8px ${colore}44)` }}>
                                                <div className="w-[76%] h-[76%] rounded-full bg-[#10132a] grid place-items-center an-scuro">
                                                    <span className="font-black tabular-nums" style={{ fontSize: "clamp(0.8rem, 22cqw, 1.5rem)", color: colore }}>
                                                        {mostra ? `${pcQ(mostra.q)}%` : "0%"}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="mt-1.5 flex justify-center items-center h-[26px]">
                                                {b.chiave ? <LogoBrand chiave={b.chiave} colore={b.colore} alt={b.label} h={24} />
                                                    : <p className="text-[11px] text-slate-300 font-bold max-w-[110px] truncate">{b.label}</p>}
                                            </div>
                                            <p className="text-[11px] font-bold truncate" style={{ color: colore }}>
                                                {mostra ? mostra.breve : (att?.breve || "—")}
                                            </p>
                                        </div>
                                    </Tip>
                                </span>
                            );
                        })}
                </div>
            </div>
        </div>
    );
}

/* ═══ RETE: un widget per OPERATORE (Luca 28/08) ════════════════════════
   «Sarebbe comodo trattarle come quelle dentro Analisi sul negozio: avere la
   possibilità di farle diventare più grandi, più piccole, adattare il
   contenuto in modalità responsive — per esempio WindTre più piccolina a
   sinistra con molta più profondità verso il basso, così da trovarmi i
   cinque contatori su tre righe, e tutto lo spazio di destra per Vodafone».
   Quindi ogni brand è una card della griglia: si trascina, si ridimensiona,
   il layout si salva in app_users.analisi_layout come per Io e Negozio. Gli
   anelli dentro si misurano in `cqw`, cioè sulla LARGHEZZA DELLA CARD: la
   stessa card stretta e alta li impila, larga e bassa li affianca. ═════ */
// ALTEZZA MINIMA e MASSIMA di un blocco brand, in righe di griglia. Il minimo
// serve perché sotto una certa misura le informazioni non si leggono; il
// MASSIMO perché un cerchio non può essere più largo della sua colonna: una
// card stretta e altissima non è spazio da sfruttare, è una forma sbagliata,
// ed era il difetto «Fastweb con vuoti enormi sopra e sotto».
const formaRete = (ctx, brand) => {
    const b = (ctx?.brandRete || []).find((x) => x.brand === brand);
    const n = b?.piste?.length || 1;
    const col = n <= 5 ? Math.max(1, n) : Math.ceil(n / 2);
    return { n, col, righe: Math.ceil(n / col), ultima: n - col * (Math.ceil(n / col) - 1) };
};
// la griglia gira a 12 colonne e righe da 150 + 10 di margine. Su uno schermo
// pieno una colonna vale ~150px, non 100: con 100 il massimo di WindTre e
// Vodafone usciva h4 mentre la disposizione dell'azienda e' h5, e bastava
// sfiorare la maniglia per farle collassare (Vodafone perdeva 3 righe di piede
// su 4 e l'anello scendeva da 221 a 190).
const COL_PX = 150, RIGA_PX = 160;
export function minWRete(ctx, brand) {
    const { col } = formaRete(ctx, brand);
    return Math.max(2, Math.ceil((82 * col + 40) / COL_PX));   // 72px di anello + 10 di gap
}
export function minHRete(ctx, brand) {
    const { righe } = formaRete(ctx, brand);
    return righe >= 3 ? 4 : righe === 2 ? 3 : 2;
}
export function maxHRete(ctx, brand, w) {
    const { col, righe } = formaRete(ctx, brand);
    const cellW = Math.max(40, (COL_PX * (w || 4) - 40) / col - 10);
    const D = Math.min(cellW, 480);
    const piede = 18 + (cellW >= 56 ? 15 : 0) + (cellW >= 78 ? 15 : 0) + (cellW >= 76 ? 14 : 0);
    // 1.5 come nel CSS (--areaMax), non 1.35: le due stime erano scollate
    // 80 = testata 42 + padding 32 + bordi 2. Niente piu' 37: la riga dei
    // chip dentro la card non esiste piu', e' salita accanto al marchio.
    return Math.max(minHRete(ctx, brand), Math.floor((righe * (1.5 * D + piede) + (righe - 1) * 10 + 120 + 80) / RIGA_PX));
}

// LE PASTIGLIE STANNO NELLA TESTATA, accanto al marchio (Luca 28/08: «le
// metterei alla destra del brand, ingrandendo un pochettino il brand: così
// recuperi spazio e puoi allargare gli anelli»). Erano una riga dentro il
// corpo e si mangiavano 37px a ogni card.
export function ChipsRete({ ctx, brand }) {
    const b = (ctx.brandRete || []).find((x) => x.brand === brand);
    if (!b) return null;
    const n = b.piste.length;
    const conQuota = !!b.quotaAttiva;
    // DUE CASELLINE, SEMPRE LE STESSE (Luca 29/08: «non e' omogeneo il dato —
    // dentro una card diamo quante sarebbero in target in proiezione, dentro
    // Vodafone quante sono in target adesso»). Prima la seconda pastiglia
    // spariva quando ripeteva lo stesso numero, e su Vodafone — che di target
    // non ne ha — restava solo il ripiego «in soglia»: tre card, tre misure
    // diverse. Adesso la coppia c'e' sempre, e a cambiare e' solo COSA si
    // conta: dove i target esistono si contano quelli, dove non esistono si
    // contano le soglie, e la parola lo dice.
    // Fino al 20 del mese si vede solo la proiezione: a inizio mese «quante
    // sono gia' in target» e' un numero che dice zero e scoraggia. Dal 21 si
    // affianca il consuntivo.
    const suTarget = b.conTarget > 0;
    const cosa = suTarget ? "in target" : "in soglia";
    const su = suTarget ? b.conTarget : (b.conSoglie || n);
    const ora = suTarget ? b.inTarget : b.inSoglia;
    const proj = suTarget ? b.inTargetProj : b.inSogliaProj;
    return (
        <span className="flex items-center gap-1.5 flex-nowrap overflow-hidden text-[10px] min-w-0">
            {/* LA SFERA NON SI STRINGE MAI, e sotto una certa larghezza il
                consuntivo SPARISCE invece di accorciarsi: troncato diventava un
                «0» solo, che sembra un numero e non lo e'. Con tutt'e due elastiche, sotto i
                1.085px di pagina la pastiglia della proiezione veniva tagliata
                in mezzo alla cifra («🔮 0/» invece di «🔮 0/1»): un numero
                sbagliato, non solo brutto — e proprio quella che fino al 20 del
                mese e' l'unica. Adesso a cedere e' il consuntivo. */}
            {(!ctx.primaDel20 || !ctx.conProiezione) && (
                <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 whitespace-nowrap min-w-0 truncate hidden @xs:inline">
                    <b className="text-white tabular-nums">{ora}</b>/{su}<span className="hidden @sm:inline"> {cosa}</span>
                </span>
            )}
            {/* «a fine mese» invece di ripetere il sostantivo: rigiocando i
                giorni in cui si vedono entrambe, le due caselle stampano lo
                STESSO numero in 37 casi su 45 — e due bolle identiche a mezzo
                centimetro di distanza si leggono come un errore, non come due
                misure. La sfera dice che e' una previsione, la parola dice
                quando. */}
            {ctx.conProiezione && (
                <span className="px-2 py-1 rounded-lg border text-white whitespace-nowrap shrink-0" style={{ background: `${b.colore}22`, borderColor: `${b.colore}55` }}>
                    🔮 <b className="tabular-nums">{proj}</b>/{su}<span className="hidden @sm:inline"> a fine mese</span>
                </span>
            )}
            {conQuota && b.pzMio != null && b.pzRete > 0 && (
                <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 whitespace-nowrap hidden @5xl:inline">
                    il mio PV <b className="tabular-nums" style={{ color: b.colore }}>{fmtN((b.pzMio / b.pzRete) * 100, 1)}%</b>
                </span>
            )}
        </span>
    );
}

function BloccoBrandRete({ ctx, brand }) {
    // il dettaglio nasce APERTO sul primo contatore (Luca 28/08: «altrimenti
    // non si vede, non se lo immaginano che si può cliccare»): "__def__" è lo
    // stato iniziale, null è una chiusura voluta dall'utente
    const [apri, setApri] = useState("__def__");
    const b = (ctx.brandRete || []).find((x) => x.brand === brand);
    if (!b) return <p className="text-xs text-slate-500 py-6 text-center">Nessuna produzione nel periodo.</p>;
    const { n, col, righe, ultima } = formaRete(ctx, brand);
    // la quota si mostra solo se il mio punto vendita quel brand lo lavora:
    // altrimenti non è uno zero, è un dato che non mi riguarda
    const conQuota = !!b.quotaAttiva;
    const primaK = b.piste.length ? `${brand}:${b.piste[0].chiave}` : null;
    const aperta = apri === "__def__" ? primaK : apri;
    // UNA BARRA SEMPRE APERTA, MAI NESSUNA (Luca 28/08: «se ci riclicco sparisce,
    // invece non deve sparire: ci deve sempre essere una barra esplosa relativa
    // a uno degli anelli»). Il click SCEGLIE la pista, non fa da interruttore;
    // e se la pista scelta non c'è più — cambio di mese, tabellare diverso — si
    // ricade sulla prima, così la barra non resta mai vuota.
    const tocca = (k) => setApri(k);
    const inDrill = b.piste.find((x) => aperta === `${brand}:${x.chiave}`) || b.piste[0] || null;
    // quante soglie deve reggere la riga dei valori sotto la barra
    const nS = inDrill ? inDrill.scala.length : 0;
    const nome = (x) => PISTA_LABEL_RETE[x.chiave] || x.nome;
    const emo = (x) => PISTA_EMOJI_RETE[x.chiave] || "▫️";
    return (
        <div className={cn("tf-rb", n === 1 && "tf-uno")} style={{
            "--col": col, "--righe": righe, "--ultima": ultima, "--nSbar": Math.max(1, nS),
            "--nS": Math.max(1, ...b.piste.map((x) => x.scala.length)),
            "--tinta": b.colore,
            // con più di un anello l'etichetta della pista è obbligatoria:
            // senza, non sai quale stai guardando. Con UNA pista sola invece il
            // nome sta gia' nella barra, e quella riga sarebbe una ripetizione.
            "--t1": n > 1 ? "1px" : "-9999px",
            // i chip si spengono da destra man mano che la card si stringe
            "--c2On": "clamp(0px, calc((100cqw - 330px) * 9999), 1px)",
            "--c3On": "clamp(0px, calc((100cqw - 530px) * 9999), 1px)",
            "--c4On": "clamp(0px, calc((100cqw - 700px) * 9999), 1px)",
        }}>
            <div className="tf-rb-area">
                {b.piste.map((x, i) => {
                    const k = `${brand}:${x.chiave}`;
                    const rif = x.proiezione ?? x.punti;
                    const prossima = x.scala.find((s) => s.soglia_da > rif) || null;
                    const spaiata = righe > 1 && i === col * (righe - 1);
                    return (
                        <div key={k} className={cn("tf-pista", spaiata && "spaiata", "cursor-pointer", inDrill === x && "sel")} onClick={() => tocca(k)}
                            title={`${emo(x)} ${nome(x)}`}>
                            <AnelloScaglioni
                                punti={x.punti} proiezione={x.proiezione} soglie={x.scala}
                                target={x.target?.v ?? null} mio={conQuota ? x.mio : null}
                                colore={b.colore} unit={x.unit} parti={x.parti?.length ? x.parti : null}
                                importante={x.importante} allarme={x.allarme} grave={x.grave}
                            />
                            {/* il piede si accende a scalini: etichetta, poi lo stato,
                                poi il target, poi quanto manca — ognuno solo se lo
                                spazio lo paga davvero */}
                            <div className="tf-foot">
                                <p className="l1">{emo(x)} {nome(x)}</p>
                                <div className="l2">
                                    {x.presa ? <span className="tf-mini text-white" style={{ background: `${b.colore}cc` }}>S{x.presa.tier} presa</span>
                                        : x.scala.length > 0 ? <span className="tf-mini text-slate-400 bg-white/5">sotto la S1</span> : null}
                                </div>
                                <div className="l3">
                                    {x.presaProj && (!x.presa || x.presaProj.tier > x.presa.tier) && (
                                        <span className="tf-mini text-white border border-white/20" style={{ background: `repeating-linear-gradient(45deg, ${b.colore}aa 0 4px, ${b.colore}55 4px 8px)` }}>🔮 S{x.presaProj.tier}</span>
                                    )}
                                    {x.target && <span className={cn("tf-mini border", rif >= x.target.v ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/30" : "text-slate-300 bg-white/5 border-white/10")}>🎯 {fmtN(x.target.v)}</span>}
                                    {x.gate && <span className="tf-mini text-amber-300 bg-amber-400/10 border border-amber-400/25">⛔</span>}
                                    {/* OBBLIGO PER CODICE: la somma di rete da sola mente
                                        (30 pezzi fatti tutti su un codice lasciano gli altri
                                        quattro in malus). Accanto al numero grande viaggia
                                        sempre «quanti codici sono a posto». */}
                                    {x.obbligo && (
                                        <span className={cn("tf-mini border", x.obbligo.fatti >= x.obbligo.su
                                            ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/30"
                                            : "text-rose-300 bg-rose-400/10 border-rose-400/30")}>
                                            🏷 {x.obbligo.fatti}/{x.obbligo.su}
                                        </span>
                                    )}
                                </div>
                                <p className="l4">
                                    {x.obbligo ? <>{x.obbligo.fatti}/{x.obbligo.su} codici a <b>{x.obbligo.quota}</b></>
                                        : prossima ? <>→ S{prossima.tier} · <b>{fmtPt(prossima.soglia_da - rif)}</b></>
                                            : x.presaProj ? "ultima soglia presa 👑" : ""}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* IL DETTAGLIO: la barra lineare, dove l'angolo torna a essere punti.
                Niente titolo sopra: ripeteva il nome che la barra ha già dentro e
                costava 23-38px per nulla. */}
            <div className="tf-rb-bar">
                {inDrill && (
                    <SogliaBar label={nome(inDrill)} emoji={emo(inDrill)} punti={inDrill.punti} pezzi={inDrill.unit === "pz" ? null : inDrill.pezzi}
                        soglie={inDrill.scala} colore={b.colore} proiezione={inDrill.proiezione} gate={inDrill.gate}
                        malus={inDrill.obbligo && inDrill.obbligo.fatti < inDrill.obbligo.su
                            ? `${inDrill.obbligo.su - inDrill.obbligo.fatti} codici sotto il minimo di ${inDrill.obbligo.quota}` : null}
                        nota={inDrill.obbligo && inDrill.obbligo.fatti >= inDrill.obbligo.su
                            ? `tutti i ${inDrill.obbligo.su} codici al minimo ✅` : null}
                        targetDir={inDrill.target?.v ?? null} targetFonte={inDrill.target?.fonte} unit={inDrill.unit} />
                )}
            </div>
        </div>
    );
}
// le stesse emoji del Master: gli anelli senza erano un po' morti (Luca 28/08)
const PISTA_EMOJI_RETE = { mobile: <IconaSim px={13} />, fisso: "🌐", assicurazioni: "🛡", lucegas: "⚡", luce: "💡", gas: "🔥", energia: "⚡", sky: "🟣", cb: "🔁", smartphone_cb: "📲", business_mobile: "💼", business_fisso: "💼", business_piva: "💼", soluzioni_digitali: "🧩", vas: "✨", protetti: "🛟", device: "📲", t2: "🌐" };
const PISTA_LABEL_RETE = { mobile: "Mobile", fisso: "Fisso", assicurazioni: "Assicurazioni", lucegas: "Luce & Gas", sky: "Punti Sky", business_mobile: "Biz mobile", business_fisso: "Biz fisso", business_piva: "Biz P.IVA", cb: "Customer Base", smartphone_cb: "Smartphone CB", soluzioni_digitali: "Sol. digitali", vas: "VAS", luce: "Luce", gas: "Gas", energia: "Luce & Gas", t2: "Fastweb T2", protetti: "W3 Protetti", device: "Telefoni & device", completezza: "Bonus Completezza" };

/* ═══ REGISTRO ═════════════════════════════════════════════════════════
   REGOLA RESPONSIVE (Luca 24/08, vale per OGNI widget presente e futuro):
   le card sono finestre ridimensionabili (@container) — il layout interno
   deve adattarsi allo SPAZIO DELLA CARD, mai al viewport:
   · stretto → elementi IMPILATI in colonna;
   · largo (@2xl/@3xl) → AFFIANCATI (grafico a sinistra, dati a destra);
   · griglie interne con varianti @ (mai sm:/xl:), liste sempre fluide;
   · niente larghezze fisse che sbordano sotto le 2 celle. ═══════════════ */
export const REGISTRO = {
    "op:w3": { nome: "WindTre", emoji: "🟠", gruppo: "operatori", def: 4, solo: null, logoChiave: "windtre", logoColore: HEX_BRAND.windtre, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="w3" ctx={ctx} size={size} /> },
    "op:vf": { nome: "Vodafone", emoji: "🔴", gruppo: "operatori", def: 4, logoChiave: "vodafone", logoColore: HEX_BRAND.vodafone, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="vf" ctx={ctx} size={size} /> },
    "op:sky": { nome: "Sky", emoji: "🟣", gruppo: "operatori", def: 4, logoChiave: "sky", logoColore: HEX_BRAND.sky, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="sky" ctx={ctx} size={size} /> },
    "op:fw": { nome: "Fastweb T2", emoji: "🟡", gruppo: "operatori", def: 4, logoChiave: "fastweb", logoColore: HEX_BRAND.fastweb, nomeBreve: "", render: (ctx, size) => <CartaOperatore brand="fw" ctx={ctx} size={size} /> },
    "marg": { nome: "Marginalità · venduto", emoji: "💰", gruppo: "marginalità", def: 8, logoChiave: "marginalita", logoColore: "#06b6d4", nomeBreve: "", render: (ctx, size) => <WidgetMarg ctx={ctx} size={size} /> },
    // ── gli ALTRI operatori (Luca 21/08: «a disposizione nei widget», fuori
    //    dal layout di default — si aggiungono dalla galleria) ─────────────
    "op:s4": { nome: "S4 Energia", emoji: "🟢", gruppo: "operatori", def: 4, logoChiave: "s4", logoColore: HEX_BRAND.s4, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="s4" nome="S4 Energia" ctx={ctx} size={size} /> },
    "op:tim": { nome: "TIM", emoji: "🔵", gruppo: "operatori", def: 4, logoChiave: "tim", logoColore: HEX_BRAND.tim, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="tim" nome="TIM" ctx={ctx} size={size} /> },
    "op:very": { nome: "Very Mobile", emoji: "🟩", gruppo: "operatori", def: 4, logoChiave: "verymobile", logoColore: HEX_BRAND.verymobile, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="verymobile" nome="Very Mobile" ctx={ctx} size={size} /> },
    "op:iliad": { nome: "Iliad", emoji: "🟥", gruppo: "operatori", def: 4, logoChiave: "iliad", logoColore: HEX_BRAND.iliad, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="iliad" nome="Iliad" ctx={ctx} size={size} /> },
    "op:ho": { nome: "Ho. Mobile", emoji: "🟪", gruppo: "operatori", def: 4, logoChiave: "homobile", logoColore: HEX_BRAND.homobile, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="homobile" nome="Ho. Mobile" ctx={ctx} size={size} /> },
    "op:kena": { nome: "Kena Mobile", emoji: "🟠", gruppo: "operatori", def: 4, logoChiave: "kenamobile", logoColore: HEX_BRAND.kenamobile, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="kenamobile" nome="Kena Mobile" ctx={ctx} size={size} /> },
    "op:dojo": { nome: "Dojo", emoji: "🟦", gruppo: "operatori", def: 4, logoChiave: "dojo", logoColore: HEX_BRAND.dojo, nomeBreve: "", render: (ctx, size) => <CartaAltro chiave="dojo" nome="Dojo" ctx={ctx} size={size} /> },
    "posizioni": { nome: "Posizioni per operatore", emoji: "🏅", gruppo: "obiettivi", def: 2, solo: "io", render: (ctx) => <WidgetPosizioni ctx={ctx} /> },
    "bersaglio": { nome: "Bersagli da superare", emoji: "🎯", gruppo: "obiettivi", def: 2, solo: "io", render: (ctx) => <WidgetBersaglio ctx={ctx} /> },
    "pesonegozi": { nome: "Il mio peso nei negozi", emoji: "⚖️", gruppo: "obiettivi", def: 4, solo: "io", render: (ctx) => <WidgetPesoNegozi ctx={ctx} /> },
    "squadra:pezzi": { nome: "Squadra — per pezzi", emoji: "🏆", gruppo: "squadra", def: 4, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="pezzi" /> },
    "squadra:w3": { nome: "Squadra — punti WindTre", emoji: "🏆", nomeBreve: "Squadra", logoChiave: "windtre", gruppo: "squadra", def: 4, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="w3" /> },
    "squadra:vf": { nome: "Squadra — punti Vodafone", emoji: "🏆", nomeBreve: "Squadra", logoChiave: "vodafone", gruppo: "squadra", def: 4, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="vf" /> },
    "squadra:sky": { nome: "Squadra — punti Sky", emoji: "🏆", nomeBreve: "Squadra", logoChiave: "sky", gruppo: "squadra", def: 4, solo: "negozio", render: (ctx) => <WidgetSquadra ctx={ctx} metrica="sky" /> },
    "duello": { nome: "Duello tra negozi", emoji: "⚔️", gruppo: "squadra", def: 2, solo: "negozio", render: (ctx) => <WidgetDuello ctx={ctx} /> },
    "mix:pezzi": { nome: "Mix operatori (pezzi)", emoji: "🧬", gruppo: "andamento", def: 2, render: (ctx) => <WidgetMixPezzi ctx={ctx} /> },
    // nasce a TUTTA LARGHEZZA (8) e alta 6: e' il riassunto del punto vendita
    // e apre l'area — cosi' anello, righe e la fila dei marchi stanno in una
    // schermata sola, senza scrollare
    "mix:persone": { nome: "Mix persone del negozio", emoji: "🧑‍🤝‍🧑", gruppo: "squadra", def: 8, h: 6, solo: "negozio", render: (ctx) => <WidgetMixPersone ctx={ctx} /> },
    // ── RETE: un widget per operatore, ridimensionabile come gli altri ────
    "rete:w3": { nome: "WindTre · rete", emoji: "🟠", gruppo: "rete", def: 4, h: 7, solo: "rete", minW: (ctx) => minWRete(ctx, "w3"), minH: (ctx) => minHRete(ctx, "w3"), maxH: (ctx, w) => maxHRete(ctx, "w3", w), logoChiave: "windtre", logoColore: HEX_BRAND.windtre, nomeBreve: "", testata: (ctx) => <ChipsRete ctx={ctx} brand="w3" />, render: (ctx) => <BloccoBrandRete ctx={ctx} brand="w3" /> },
    "rete:vf": { nome: "Vodafone · rete", emoji: "🔴", gruppo: "rete", def: 4, h: 7, solo: "rete", minW: (ctx) => minWRete(ctx, "vf"), minH: (ctx) => minHRete(ctx, "vf"), maxH: (ctx, w) => maxHRete(ctx, "vf", w), logoChiave: "vodafone", logoColore: HEX_BRAND.vodafone, nomeBreve: "", testata: (ctx) => <ChipsRete ctx={ctx} brand="vf" />, render: (ctx) => <BloccoBrandRete ctx={ctx} brand="vf" /> },
    "rete:sky": { nome: "Sky · rete", emoji: "🟣", gruppo: "rete", def: 4, h: 5, solo: "rete", minW: (ctx) => minWRete(ctx, "sky"), minH: (ctx) => minHRete(ctx, "sky"), maxH: (ctx, w) => maxHRete(ctx, "sky", w), logoChiave: "sky", logoColore: HEX_BRAND.sky, nomeBreve: "", testata: (ctx) => <ChipsRete ctx={ctx} brand="sky" />, render: (ctx) => <BloccoBrandRete ctx={ctx} brand="sky" /> },
    "rete:fw": { nome: "Fastweb T2 · rete", emoji: "🟡", gruppo: "rete", def: 2, h: 6, solo: "rete", minW: (ctx) => minWRete(ctx, "fw"), minH: (ctx) => minHRete(ctx, "fw"), maxH: (ctx, w) => maxHRete(ctx, "fw", w), logoChiave: "fastweb", logoColore: HEX_BRAND.fastweb, nomeBreve: "", testata: (ctx) => <ChipsRete ctx={ctx} brand="fw" />, render: (ctx) => <BloccoBrandRete ctx={ctx} brand="fw" /> },
    "rete:s4": { nome: "S4 Energia · rete", emoji: "🟢", gruppo: "rete", def: 2, h: 5, solo: "rete", minW: (ctx) => minWRete(ctx, "s4"), minH: (ctx) => minHRete(ctx, "s4"), maxH: (ctx, w) => maxHRete(ctx, "s4", w), logoChiave: "s4", logoColore: HEX_BRAND.s4, nomeBreve: "", testata: (ctx) => <ChipsRete ctx={ctx} brand="s4" />, render: (ctx) => <BloccoBrandRete ctx={ctx} brand="s4" /> },
};
export const GRUPPI = ["operatori", "marginalità", "squadra", "obiettivi", "andamento", "rete"];
export const DEFAULT_LAYOUT = {
    io: ["op:w3@4", "op:vf@4", "op:sky@4", "op:fw@4", "op:s4@2", "posizioni@2", "bersaglio@2", "pesonegozi@4", "marg@8", "mix:pezzi@2"],
    // il Mix persone apre l'area: è la prima domanda che ci si fa su un PV
    rete: ["rete:w3@4", "rete:vf@4", "rete:sky@4", "rete:fw@2", "rete:s4@2"],
    negozio: ["mix:persone@8", "op:w3@4", "op:vf@4", "op:sky@4", "op:fw@4", "op:s4@2", "squadra:pezzi@4", "duello@2", "mix:pezzi@2", "marg@8", "squadra:w3@4"],
};
