// @ts-nocheck
"use client";

// ANALISI (Luca 20/08 notte) — la sezione-vetrina del CRM, SOLO NUMERICA
// (punti e pezzi di gara; la parte a valore arriverà dopo, a operatori
// configurati). Tre aree per tutti + una di regia:
//   👤 IO        → la produzione personale, posizioni, contributo ai negozi
//   🏪 NEGOZIO   → squadra, classifica interna, confronto con altri PV
//   🌍 RETE      → i punti di TUTTA la rete contro le soglie (le soglie si
//                  prendono a rete: è così che è impostata la gara ragazzi)
//   🎛 REGIA     → SOLO admin: doppia lente negozio-che-registra ↔ CODICE DI
//                  INSERIMENTO (fondamentale per i target), gare aziendali.
// Visibilità APERTA by design: chiunque può switchare su altri negozi e sulla
// rete (appartenenza + confronto). PER ORA la voce è accesa solo per admin/dev
// (Luca vuole vederla per primo): si apre a tutti togliendo il gate in nav.ts.
// Multi-negozio: chi presenzia più PV vede il suo split e il contributo per
// ogni negozio in cui ha prodotto; l'area Negozio ha il selettore.
// REGOLA NUMERI: qui si parla la lingua delle GARE — punti dal motore
// (tabellari ragazzi), pezzi = registrato del perimetro gare. Il codice di
// inserimento NON compare mai fuori dalla Regia.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { giorniLavorativiMese, caricaContrattiMese, caricaTabellare, caricaTabellareAzienda, matchRigheAttivazione, puntiPerRighe, brandIdDaLabel, contestoVfFw, calcolaAvanzamento } from "@/lib/commissioning";
import { TRK_BRAND_COLORS, TRK_BRAND_LOGOS } from "@/lib/brandAssets";
import { SelectOpzioni } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { Loader2, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Num, Tip, TipRiga, TipTitolo, Ring, AreaChart, RaceBars, StackMix, HeatCal, ScalaSoglie, Delta, fmtPt, fmtN } from "./_charts";

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const norm = (s) => String(s || "").trim().toLowerCase();

// brand di gara mostrati (la lingua dei punti)
const GARA = {
    w3: { label: "WindTre", colore: TRK_BRAND_COLORS.windtre, logo: TRK_BRAND_LOGOS.windtre },
    vf: { label: "Vodafone", colore: TRK_BRAND_COLORS.vodafone, logo: TRK_BRAND_LOGOS.vodafone },
    fw: { label: "Fastweb", colore: TRK_BRAND_COLORS.fastweb, logo: TRK_BRAND_LOGOS.fastweb },
    sky: { label: "Sky", colore: TRK_BRAND_COLORS.sky, logo: TRK_BRAND_LOGOS.sky },
};
const PISTA_LABEL = { mobile: "Mobile", fisso: "Fisso", assicurazioni: "Assicurazioni", lucegas: "Luce & Gas", sky: "Punti Sky", business_mobile: "Biz mobile", business_fisso: "Biz fisso" };

const MACRO = [
    { k: "mobile", re: /^(mobile|sim)/i, label: "Mobile", emoji: "📱", colore: "var(--tf-818cf8)" },
    { k: "fisso", re: /^(fisso|fibra)/i, label: "Fisso", emoji: "🌐", colore: "var(--tf-22c55e)" },
    { k: "tv", re: /^tv|glass/i, label: "TV", emoji: "📺", colore: "var(--tf-0072c6)" },
    { k: "tel", re: /^telefono a rate/i, label: "Telefoni", emoji: "📲", colore: "var(--tf-f97316)" },
    { k: "cb", re: /^customer base/i, label: "Customer Base", emoji: "🔁", colore: "var(--tf-eab308)" },
    { k: "energia", re: /^energia/i, label: "Energia", emoji: "⚡", colore: "var(--tf-84cc16)" },
    { k: "prot", re: /assicuraz|multi[- ]?serv|protez/i, label: "Protezione", emoji: "🛡", colore: "var(--tf-14b8a6)" },
];
const macroDi = (categoria) => MACRO.find((m) => m.re.test(String(categoria || ""))) || { k: "altro", label: "Altro", emoji: "➕", colore: "#64748b" };

const ymLocale = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; };
const ymISO = ({ y, m }) => `${y}-${String(m).padStart(2, "0")}`;
const ymPrec = ({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
const giorniDelMese = ({ y, m }) => new Date(y, m, 0).getDate();

/* ── arricchimento: ogni vendita del perimetro gare → punti (lente ragazzi) ─ */
function arricchisci(rw3, rvf, rfw, rsky, tw3, tvf, tsky) {
    const items = [];
    const push = (c, brandGara, set, flags = {}) => items.push({
        id: c.id, brandGara,
        negozio: c.negozio || "—", venditore: c.venditore || "—", cod_ins: c.cod_ins || "—",
        g: Number(String(c.data || "").slice(8, 10)) || 0,
        categoria: c.categoria, prodotto: c.prodotto, tipo: c.tipo_cliente,
        pista: set[0]?.pista || null, punti: set.length ? puntiPerRighe(set) : 0,
        ...flags,
    });
    for (const c of rw3) {
        const set = tw3 ? matchRigheAttivazione(tw3.righe, c, brandIdDaLabel(c.brand) || "windtre") : [];
        push(c, "w3", set, { senzaRiga: !set.length });
    }
    // gara Vodafone = vendite Vodafone + Fastweb caricato in lettera A (T1);
    // esclusioni lettera: MNP da Vodafone/Fastweb/Ho. = pezzi sì, punti no
    const inA = (c) => contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone";
    for (const c of [...rvf, ...rfw.filter(inA)]) {
        const esclusa = /mnp/i.test(String(c.prodotto || "")) && /vodafone|fastweb|\bho\b|ho\./i.test(String(c.provenienza || ""));
        const set = (!esclusa && tvf) ? matchRigheAttivazione(tvf.righe, c, brandIdDaLabel(c.brand) || "vodafone") : [];
        push(c, "vf", set, { senzaRiga: !esclusa && !set.length, esclusa, fwInA: brandIdDaLabel(c.brand) === "fastweb" });
    }
    for (const c of rfw.filter((c) => !inA(c))) push(c, "fw", [], { t2: true });
    for (const c of rsky) {
        const set = tsky ? matchRigheAttivazione(tsky.righe, c, "sky") : [];
        push(c, "sky", set, { senzaRiga: !set.length });
    }
    return items;
}

/* ── aggregati di uno scope (lista di items già filtrata) ──────────────── */
function aggrega(items) {
    const perBrand = {}; const perPista = {}; let punti = 0; let esclusi = 0; let senzaRiga = 0;
    for (const it of items) {
        punti += it.punti;
        if (it.esclusa) esclusi++;
        if (it.senzaRiga) senzaRiga++;
        const b = (perBrand[it.brandGara] ??= { punti: 0, pezzi: 0 });
        b.punti += it.punti; b.pezzi++;
        if (it.pista) { const p = (perPista[`${it.brandGara}·${it.pista}`] ??= { punti: 0, pezzi: 0 }); p.punti += it.punti; p.pezzi++; }
    }
    return { punti, pezzi: items.length, perBrand, perPista, esclusi, senzaRiga };
}
const detBrand = (agg) => Object.entries(agg.perBrand)
    .sort((a, b) => b[1].punti - a[1].punti)
    .map(([k, v]) => ({ l: `${GARA[k].label} · ${v.pezzi} pz`, r: `${fmtPt(v.punti)} pt`, colore: GARA[k].colore }));

/* ── serie giornaliera cumulata di uno scope ───────────────────────────── */
function serieGiorni(items, nGiorni, ym) {
    const perG = Array.from({ length: nGiorni }, () => ({ tot: 0, brand: {} }));
    for (const it of items) {
        if (it.g < 1 || it.g > nGiorni) continue;
        perG[it.g - 1].tot += it.punti;
        perG[it.g - 1].brand[it.brandGara] = (perG[it.g - 1].brand[it.brandGara] || 0) + it.punti;
    }
    let cum = 0;
    return perG.map((d, i) => {
        cum += d.tot;
        return {
            x: `${String(i + 1).padStart(2, "0")} ${MESI[ym.m - 1].slice(0, 3)}`,
            y: Math.round(cum * 100) / 100,
            det: [
                { l: "nel giorno", r: `+${fmtPt(d.tot)} pt` },
                ...Object.entries(d.brand).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ l: GARA[k].label, r: `+${fmtPt(v)}`, colore: GARA[k].colore })),
            ],
        };
    });
}

/* ── classifica per chiave (venditore o negozio) ───────────────────────── */
function classifica(items, chiave) {
    const per = new Map();
    for (const it of items) {
        const k = it[chiave]; if (!k || k === "—") continue;
        const e = per.get(k) || { items: [] };
        e.items.push(it); per.set(k, e);
    }
    return [...per.entries()]
        .map(([k, e]) => ({ k, agg: aggrega(e.items) }))
        .sort((a, b) => b.agg.punti - a.agg.punti || b.agg.pezzi - a.agg.pezzi);
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function Analisi() {
    const { user } = useAuth();
    const admin = ["admin", "dev"].includes(user?.role || "");

    const [ym, setYm] = useState(ymLocale());
    const [area, setArea] = useState("io");
    const [dati, setDati] = useState(null);
    const [loading, setLoading] = useState(true);

    // caricamento del mese (motore + tabellari + mese precedente per i delta)
    useEffect(() => {
        let alive = true;
        setLoading(true);
        (async () => {
            const mISO = `${ymISO(ym)}-01`;
            const pv = ymPrec(ym); const pISO = `${ymISO(pv)}-01`;
            try {
                const [rw3, rvf, rfw, rsky, tw3, tvf, tsky, aw3, avf, asky, gl,
                    pw3, pvf, pfw, psky, ptw3, ptvf, ptsky] = await Promise.all([
                        caricaContrattiMese("WindTre", mISO), caricaContrattiMese("Vodafone", mISO),
                        caricaContrattiMese("Fastweb", mISO), caricaContrattiMese("Sky", mISO),
                        caricaTabellare("windtre", mISO), caricaTabellare("vodafone", mISO), caricaTabellare("sky", mISO),
                        caricaTabellareAzienda("windtre", mISO), caricaTabellareAzienda("vodafone", mISO), caricaTabellareAzienda("sky", mISO),
                        giorniLavorativiMese(mISO),
                        caricaContrattiMese("WindTre", pISO), caricaContrattiMese("Vodafone", pISO),
                        caricaContrattiMese("Fastweb", pISO), caricaContrattiMese("Sky", pISO),
                        caricaTabellare("windtre", pISO), caricaTabellare("vodafone", pISO), caricaTabellare("sky", pISO),
                    ]);
                if (!alive) return;
                setDati({ rw3, rvf, rfw, rsky, tw3, tvf, tsky, aw3, avf, asky, gl, prev: { rw3: pw3, rvf: pvf, rfw: pfw, rsky: psky, tw3: ptw3, tvf: ptvf, tsky: ptsky } });
            } finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [ym.y, ym.m]);

    const items = useMemo(() => dati ? arricchisci(dati.rw3, dati.rvf, dati.rfw, dati.rsky, dati.tw3, dati.tvf, dati.tsky) : [], [dati]);
    const itemsPrev = useMemo(() => dati ? arricchisci(dati.prev.rw3, dati.prev.rvf, dati.prev.rfw, dati.prev.rsky, dati.prev.tw3, dati.prev.tvf, dati.prev.tsky) : [], [dati]);

    // ── persona osservata: chi entra vede SÉ; l'admin (che non vende) parte
    //    dal migliore del mese e può cambiare — è anche l'anteprima di come
    //    la vedranno i ragazzi
    const venditori = useMemo(() => classifica(items, "venditore"), [items]);
    const [personaSel, setPersonaSel] = useState("");
    const persona = useMemo(() => {
        if (personaSel) return personaSel;
        const mio = venditori.find((v) => norm(v.k) === norm(user?.name));
        return mio?.k || venditori[0]?.k || "";
    }, [personaSel, venditori, user?.name]);

    const mieiItems = useMemo(() => items.filter((it) => norm(it.venditore) === norm(persona)), [items, persona]);
    const mieiNegozi = useMemo(() => {
        const per = new Map();
        for (const it of mieiItems) per.set(it.negozio, (per.get(it.negozio) || 0) + it.punti);
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [mieiItems]);

    // ── negozio osservato: il primo della persona (o il suo primary), sempre
    //    switchabile su qualunque PV (visibilità aperta, decisione Luca)
    const negozi = useMemo(() => classifica(items, "negozio"), [items]);
    const [negozioSel, setNegozioSel] = useState("");
    const negozio = useMemo(() => {
        if (negozioSel) return negozioSel;
        return mieiNegozi[0] || (user?.negozio && negozi.find((n) => norm(n.k) === norm(user.negozio))?.k) || negozi[0]?.k || "";
    }, [negozioSel, mieiNegozi, negozi, user?.negozio]);

    const oggi = useMemo(() => { const d = new Date(); return d.getFullYear() === ym.y && d.getMonth() + 1 === ym.m ? d.getDate() : -1; }, [ym]);
    const nG = giorniDelMese(ym);
    const meseCorrente = oggi > 0;

    if (!admin) {
        return (
            <div className="min-h-[60vh] grid place-items-center">
                <div className="glass-card rounded-2xl p-10 text-center max-w-sm">
                    <Lock className="w-8 h-8 mx-auto text-slate-500" />
                    <p className="mt-3 text-white font-bold">Analisi in anteprima</p>
                    <p className="mt-1 text-sm text-slate-400">La sezione sta per aprirsi a tutta la rete. Ancora qualche giorno. 👀</p>
                </div>
            </div>
        );
    }

    const AREE = [
        { id: "io", emoji: "👤", label: "Io" },
        { id: "negozio", emoji: "🏪", label: "Negozio" },
        { id: "rete", emoji: "🌍", label: "Rete" },
        ...(admin ? [{ id: "regia", emoji: "🎛", label: "Regia" }] : []),
    ];

    return (
        <div className="space-y-5 pb-10">
            <style>{`
                @keyframes anFadeUp { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:none; } }
                @keyframes anAurora { 0% { transform: translate3d(-12%, -6%, 0) scale(1); } 50% { transform: translate3d(10%, 8%, 0) scale(1.15); } 100% { transform: translate3d(-12%, -6%, 0) scale(1); } }
                .an-in { animation: anFadeUp .5s cubic-bezier(.22,1,.36,1) both; }
                .an-card { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
                .an-card:hover { transform: translateY(-3px); border-color: rgba(255,255,255,.18); box-shadow: 0 18px 40px -18px rgba(0,0,0,.7); }
            `}</style>

            {/* ── HERO ─────────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d1022]/80 p-5 sm:p-6 an-in">
                <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-3xl" style={{ background: "radial-gradient(circle, var(--tf-818cf8), transparent 65%)", animation: "anAurora 16s ease-in-out infinite" }} />
                <div className="pointer-events-none absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, var(--tf-e60000), transparent 65%)", animation: "anAurora 22s ease-in-out infinite reverse" }} />
                <div className="relative flex flex-wrap items-center gap-3 justify-between">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">📊 Analisi</h1>
                        <p className="text-xs text-slate-400 mt-1">La lingua delle gare: punti dal motore, pezzi registrati. In tempo reale.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setYm(ymPrec(ym))} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                        <span className="min-w-[150px] text-center text-sm font-bold text-white">{MESI[ym.m - 1]} {ym.y}</span>
                        <button onClick={() => { const n = ym.m === 12 ? { y: ym.y + 1, m: 1 } : { y: ym.y, m: ym.m + 1 }; const adesso = ymLocale(); if (n.y > adesso.y || (n.y === adesso.y && n.m > adesso.m)) return; setYm(n); }}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
                <div className="relative mt-4 flex flex-wrap items-center gap-3">
                    <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
                        {AREE.map((a) => (
                            <button key={a.id} onClick={() => setArea(a.id)} className={cn(
                                "px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                                area === a.id
                                    ? "text-white bg-gradient-to-r from-indigo-500/90 to-fuchsia-500/80 shadow-lg shadow-indigo-500/30 scale-[1.04]"
                                    : "text-slate-400 hover:text-white hover:bg-white/5",
                            )}>{a.emoji} {a.label}</button>
                        ))}
                    </div>
                    {area === "io" && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>Guarda:</span>
                            <SelectOpzioni value={persona} onChange={(v) => setPersonaSel(v)} opzioni={venditori.map((v) => v.k)} placeholder="venditore…" className="min-w-[190px]" />
                        </div>
                    )}
                    {area === "negozio" && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>Negozio:</span>
                            <SelectOpzioni value={negozio} onChange={(v) => setNegozioSel(v)} opzioni={negozi.map((n) => n.k)} placeholder="negozio…" className="min-w-[190px]" />
                        </div>
                    )}
                </div>
            </div>

            {loading || !dati ? (
                <div className="flex items-center justify-center py-24 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carico il motore delle gare…</div>
            ) : (
                <>
                    {area === "io" && <AreaIo key={`io-${persona}-${ymISO(ym)}`} {...{ items, itemsPrev, persona, mieiItems, mieiNegozi, negozi, venditori, ym, nG, oggi, gl: dati.gl, meseCorrente }} />}
                    {area === "negozio" && <AreaNegozio key={`ng-${negozio}-${ymISO(ym)}`} {...{ items, itemsPrev, negozio, negozi, ym, nG, oggi, gl: dati.gl, meseCorrente, persona }} />}
                    {area === "rete" && <AreaRete key={`rt-${ymISO(ym)}`} {...{ items, itemsPrev, dati, ym, nG, oggi, gl: dati.gl, meseCorrente, negozi }} />}
                    {area === "regia" && admin && <AreaRegia key={`rg-${ymISO(ym)}`} {...{ items, dati, ym, nG, oggi, gl: dati.gl }} />}
                </>
            )}
        </div>
    );
}

/* ── mattoni di layout ─────────────────────────────────────────────────── */
const Card = ({ title, emoji, action, children, className, delay = 0 }) => (
    <div className={cn("glass-card an-card rounded-2xl p-4 an-in", className)} style={{ animationDelay: `${delay}ms` }}>
        <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{emoji} {title}</p>
            {action}
        </div>
        {children}
    </div>
);

const TileBig = ({ label, value, punti = true, sub, delta, colore = "var(--tf-818cf8)", delay = 0 }) => (
    <div className="glass-card an-card rounded-2xl p-4 an-in relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
        <div className="pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-15 blur-2xl" style={{ background: colore }} />
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
        <p className="mt-1.5 text-3xl font-black text-white leading-none">
            {typeof value === "number" ? <Num v={value} punti={punti} /> : value}
        </p>
        <div className="mt-1.5 flex items-center gap-2 min-h-[16px]">
            {delta !== undefined && <Delta v={delta} />}
            {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
        </div>
    </div>
);

const proiezione = (val, gl) => (gl && gl.trascorsi > 0 && gl.totali > 0 ? (val / gl.trascorsi) * gl.totali : null);

/* ═══ AREA IO ══════════════════════════════════════════════════════════ */
function AreaIo({ items, itemsPrev, persona, mieiItems, mieiNegozi, negozi, venditori, ym, nG, oggi, gl, meseCorrente }) {
    const agg = useMemo(() => aggrega(mieiItems), [mieiItems]);
    const aggPrev = useMemo(() => aggrega(itemsPrev.filter((it) => norm(it.venditore) === norm(persona))), [itemsPrev, persona]);
    const posRete = venditori.findIndex((v) => v.k === persona) + 1;

    const negozioCasa = mieiNegozi[0] || "";
    const squadra = useMemo(() => classifica(items.filter((it) => it.negozio === negozioCasa), "venditore"), [items, negozioCasa]);
    const posNegozio = squadra.findIndex((v) => v.k === persona) + 1;

    const serie = useMemo(() => serieGiorni(mieiItems, nG, ym), [mieiItems, nG, ym]);
    const ghost = useMemo(() => serieGiorni(itemsPrev.filter((it) => norm(it.venditore) === norm(persona)), nG, ym), [itemsPrev, persona, nG, ym]);

    const perGiorno = useMemo(() => {
        const v = Array.from({ length: nG }, (_, i) => ({ n: i + 1, label: `${String(i + 1).padStart(2, "0")} ${MESI[ym.m - 1]}`, val: 0, det: [] }));
        const b = {};
        for (const it of mieiItems) { if (it.g >= 1 && it.g <= nG) { v[it.g - 1].val += it.punti; (b[it.g] ??= {}); b[it.g][it.brandGara] = (b[it.g][it.brandGara] || 0) + it.punti; } }
        v.forEach((d) => { d.det = Object.entries(b[d.n] || {}).map(([k, x]) => ({ l: GARA[k].label, r: `+${fmtPt(x)}`, colore: GARA[k].colore })); });
        return v;
    }, [mieiItems, nG, ym]);
    const migliorG = perGiorno.reduce((mx, d) => (d.val > (mx?.val || 0) ? d : mx), null);
    const giorniAttivi = perGiorno.filter((d) => d.val > 0).length;

    // il bersaglio più vicino: chi ho davanti in negozio (o in rete se sono 1º)
    const bersaglio = useMemo(() => {
        if (posNegozio > 1) { const su = squadra[posNegozio - 2]; return { label: `per superare ${su.k}`, gap: su.agg.punti - agg.punti, dove: negozioCasa }; }
        if (posRete > 1) { const su = venditori[posRete - 2]; return { label: `per superare ${su.k} (rete)`, gap: su.agg.punti - agg.punti, dove: "rete" }; }
        return null;
    }, [posNegozio, posRete, squadra, venditori, agg.punti, negozioCasa]);

    const mix = useMemo(() => {
        const per = {};
        for (const it of mieiItems) { const m = macroDi(it.categoria); (per[m.k] ??= { ...m, val: 0 }); per[m.k].val++; }
        return Object.values(per).sort((a, b) => b.val - a.val);
    }, [mieiItems]);

    const proi = meseCorrente ? proiezione(agg.punti, gl) : null;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <TileBig label="Punti gara" value={agg.punti} delta={agg.punti - aggPrev.punti} sub="vs mese scorso" delay={0} />
                <TileBig label="Pezzi" value={agg.pezzi} punti={false} delta={agg.pezzi - aggPrev.pezzi} sub="registrati" colore="var(--tf-22c55e)" delay={40} />
                <TileBig label={`In ${negozioCasa || "negozio"}`} value={posNegozio > 0 ? `${posNegozio}º` : "—"} sub={posNegozio === 1 ? "in testa 👑" : `su ${squadra.length}`} colore="var(--tf-f97316)" delay={80} />
                <TileBig label="In rete" value={posRete > 0 ? `${posRete}º` : "—"} sub={`su ${venditori.length} venditori`} colore="var(--tf-e60000)" delay={120} />
                <TileBig label="Miglior giorno" value={migliorG?.val ? migliorG.val : "—"} sub={migliorG?.val ? migliorG.label : "ancora niente"} colore="var(--tf-0072c6)" delay={160} />
                <TileBig label={meseCorrente ? "Proiezione" : "Giorni attivi"} value={meseCorrente ? (proi ?? "—") : giorniAttivi} punti={meseCorrente} sub={meseCorrente ? `fine mese · oggi ${giorniAttivi} gg attivi` : "con almeno una vendita"} colore="var(--tf-14b8a6)" delay={200} />
            </div>

            {bersaglio && bersaglio.gap > 0 && (
                <div className="an-in rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 flex items-center gap-3" style={{ animationDelay: "240ms" }}>
                    <span className="text-xl">🎯</span>
                    <p className="text-sm text-amber-100"><b className="tabular-nums">{fmtPt(bersaglio.gap)} punti</b> {bersaglio.label} — un'altra vendita buona e ci sei.</p>
                </div>
            )}

            <div className="grid lg:grid-cols-3 gap-4">
                <Card title="Il tuo mese, punto su punto" emoji="📈" className="lg:col-span-2" delay={80}>
                    <AreaChart serie={serie} ghost={ghost.length ? ghost : null} oggi={oggi > 0 ? oggi - 1 : -1} colore="var(--tf-818cf8)" h={190} />
                    <p className="mt-1 text-[10px] text-slate-500">linea piena = questo mese (cumulato) · tratteggiata = mese scorso · passa il mouse sui giorni</p>
                </Card>
                <Card title="I tuoi brand" emoji="🏁" delay={120}>
                    <div className="space-y-2.5">
                        {Object.entries(agg.perBrand).sort((a, b) => b[1].punti - a[1].punti).map(([k, v]) => (
                            <Tip key={k} block tip={<div><TipTitolo>{GARA[k].label}</TipTitolo>
                                {Object.entries(agg.perPista).filter(([kk]) => kk.startsWith(k + "·")).map(([kk, p]) => (
                                    <TipRiga key={kk} l={PISTA_LABEL[kk.split("·")[1]] || kk.split("·")[1]} r={`${fmtPt(p.punti)} pt · ${p.pezzi} pz`} colore={GARA[k].colore} />
                                ))}
                                {k === "fw" && <p className="text-[10px] text-slate-500 mt-1">gara T2 a pezzi (T1 conta in Vodafone)</p>}
                            </div>}>
                                <div className="flex items-center gap-3 rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: GARA[k].colore, boxShadow: `0 0 8px ${GARA[k].colore}` }} />
                                    <span className="text-sm font-semibold text-slate-200 flex-1">{GARA[k].label}</span>
                                    <span className="text-sm font-black text-white tabular-nums">{fmtPt(v.punti)} <span className="text-[9px] font-normal text-slate-500">pt</span></span>
                                    <span className="text-[10px] text-slate-500 tabular-nums w-12 text-right">{v.pezzi} pz</span>
                                </div>
                            </Tip>
                        ))}
                        {!agg.pezzi && <p className="text-xs text-slate-500 text-center py-4">Nessuna vendita nel mese.</p>}
                    </div>
                </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
                <Card title="Il tuo peso nei negozi" emoji="⚖️" delay={160}>
                    <div className="flex flex-wrap items-center justify-around gap-3">
                        {mieiNegozi.slice(0, 3).map((n) => {
                            const store = negozi.find((x) => x.k === n);
                            const miei = mieiItems.filter((it) => it.negozio === n).reduce((s, it) => s + it.punti, 0);
                            const tot = store?.agg.punti || 0;
                            return (
                                <Ring key={n} value={miei} max={tot || 1} size={110} colore="var(--tf-f97316)"
                                    centro={<><span className="text-xl font-black text-white tabular-nums">{tot ? Math.round((miei / tot) * 100) : 0}%</span><span className="text-[9px] text-slate-500 leading-tight">{n}</span></>}
                                    tip={<div><TipTitolo>{n}</TipTitolo><TipRiga l="tuoi punti" r={fmtPt(miei)} /><TipRiga l="punti negozio" r={fmtPt(tot)} /></div>}
                                />
                            );
                        })}
                        {!mieiNegozi.length && <p className="text-xs text-slate-500 py-4">Nessuna vendita nel mese.</p>}
                    </div>
                    {mieiNegozi.length > 1 && <p className="mt-2 text-[10px] text-amber-200/80 text-center">presidi più punti vendita: qui vedi quanto pesi in ognuno 💪</p>}
                </Card>
                <Card title="Cosa vendi (mix pezzi)" emoji="🧬" delay={200}>
                    <StackMix parti={mix} />
                </Card>
                <Card title="Il ritmo del mese" emoji="🗓" delay={240}>
                    <HeatCal giorni={perGiorno} oggi={oggi > 0 ? oggi - 1 : -1} colore="var(--tf-818cf8)" />
                    <p className="mt-2 text-[10px] text-slate-500">{giorniAttivi} giorni con vendite · più acceso = più punti</p>
                </Card>
            </div>
        </div>
    );
}

/* ═══ AREA NEGOZIO ═════════════════════════════════════════════════════ */
function AreaNegozio({ items, itemsPrev, negozio, negozi, ym, nG, oggi, gl, meseCorrente, persona }) {
    const del = useMemo(() => items.filter((it) => it.negozio === negozio), [items, negozio]);
    const agg = useMemo(() => aggrega(del), [del]);
    const aggPrev = useMemo(() => aggrega(itemsPrev.filter((it) => it.negozio === negozio)), [itemsPrev, negozio]);
    const pos = negozi.findIndex((n) => n.k === negozio) + 1;
    const squadra = useMemo(() => classifica(del, "venditore"), [del]);
    const serie = useMemo(() => serieGiorni(del, nG, ym), [del, nG, ym]);
    const ghost = useMemo(() => serieGiorni(itemsPrev.filter((it) => it.negozio === negozio), nG, ym), [itemsPrev, negozio, nG, ym]);
    const proi = meseCorrente ? proiezione(agg.punti, gl) : null;

    // duello: il negozio subito sopra in classifica (o quello sotto se 1º)
    const [rivaleSel, setRivaleSel] = useState("");
    const rivale = rivaleSel || (pos > 1 ? negozi[pos - 2]?.k : negozi[1]?.k) || "";
    const aggRiv = useMemo(() => aggrega(items.filter((it) => it.negozio === rivale)), [items, rivale]);

    const mix = useMemo(() => {
        const per = {};
        for (const it of del) { const m = macroDi(it.categoria); (per[m.k] ??= { ...m, val: 0 }); per[m.k].val++; }
        return Object.values(per).sort((a, b) => b.val - a.val);
    }, [del]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TileBig label={`Punti ${negozio}`} value={agg.punti} delta={agg.punti - aggPrev.punti} sub="vs mese scorso" />
                <TileBig label="Pezzi" value={agg.pezzi} punti={false} delta={agg.pezzi - aggPrev.pezzi} sub="registrati" colore="var(--tf-22c55e)" delay={40} />
                <TileBig label="In rete" value={pos > 0 ? `${pos}º` : "—"} sub={`su ${negozi.length} negozi`} colore="var(--tf-e60000)" delay={80} />
                <TileBig label={meseCorrente ? "Proiezione" : "Squadra"} value={meseCorrente ? (proi ?? "—") : squadra.length} punti={meseCorrente} sub={meseCorrente ? "punti a fine mese" : "venditori attivi"} colore="var(--tf-14b8a6)" delay={120} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
                <Card title={`La squadra di ${negozio}`} emoji="🏆" className="lg:col-span-2" delay={80}>
                    <RaceBars righe={squadra.map((v) => ({
                        k: v.k, label: v.k, val: v.agg.punti, me: norm(v.k) === norm(persona),
                        colore: "var(--tf-f97316)", det: [...detBrand(v.agg), { l: "pezzi", r: fmtN(v.agg.pezzi) }],
                    }))} />
                </Card>
                <Card title="Duello" emoji="⚔️" delay={120} action={
                    <SelectOpzioni value={rivale} onChange={setRivaleSel} opzioni={negozi.map((n) => n.k).filter((k) => k !== negozio)} placeholder="sfida…" className="min-w-[140px]" />
                }>
                    {rivale ? (
                        <div className="space-y-3">
                            {[{ n: negozio, a: agg, c: "var(--tf-818cf8)" }, { n: rivale, a: aggRiv, c: "var(--tf-e60000)" }].map((x) => (
                                <div key={x.n}>
                                    <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-200">{x.n}</span><span className="font-black text-white tabular-nums">{fmtPt(x.a.punti)} pt</span></div>
                                    <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.max(3, (x.a.punti / Math.max(1, agg.punti, aggRiv.punti)) * 100)}%`, background: `linear-gradient(90deg, ${x.c}66, ${x.c})`, boxShadow: `0 0 10px ${x.c}66` }} />
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-slate-500">{fmtN(x.a.pezzi)} pezzi</div>
                                </div>
                            ))}
                            <p className="text-[11px] text-center pt-1 text-slate-400">
                                {agg.punti === aggRiv.punti ? "Perfetta parità 🤝" : agg.punti > aggRiv.punti
                                    ? <>in vantaggio di <b className="text-emerald-300 tabular-nums">{fmtPt(agg.punti - aggRiv.punti)} pt</b> 🚀</>
                                    : <>sotto di <b className="text-rose-300 tabular-nums">{fmtPt(aggRiv.punti - agg.punti)} pt</b> — si recupera 🔥</>}
                            </p>
                        </div>
                    ) : <p className="text-xs text-slate-500 py-4 text-center">Scegli un negozio da sfidare.</p>}
                </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
                <Card title="Il mese del negozio" emoji="📈" className="lg:col-span-2" delay={160}>
                    <AreaChart serie={serie} ghost={ghost.length ? ghost : null} oggi={oggi > 0 ? oggi - 1 : -1} colore="var(--tf-f97316)" h={180} />
                </Card>
                <Card title="Mix del negozio" emoji="🧬" delay={200}>
                    <StackMix parti={mix} />
                    {agg.esclusi > 0 && <p className="mt-2 text-[10px] text-slate-500">⚠ {agg.esclusi} MNP escluse dai punti (lettera Vodafone)</p>}
                    {agg.senzaRiga > 0 && <p className="text-[10px] text-slate-500">⚠ {agg.senzaRiga} vendite senza riga di gara (pezzi sì, punti no)</p>}
                </Card>
            </div>
        </div>
    );
}

/* ═══ AREA RETE ════════════════════════════════════════════════════════ */
function AreaRete({ items, itemsPrev, dati, ym, nG, oggi, gl, meseCorrente, negozi }) {
    const agg = useMemo(() => aggrega(items), [items]);
    const aggPrev = useMemo(() => aggrega(itemsPrev), [itemsPrev]);
    const serie = useMemo(() => serieGiorni(items, nG, ym), [items, nG, ym]);
    const ghost = useMemo(() => serieGiorni(itemsPrev, nG, ym), [itemsPrev, nG, ym]);
    const proi = meseCorrente ? proiezione(agg.punti, gl) : null;

    // SOGLIE DI RETE (gara ragazzi): il motore vero, brand per brand
    const soglieBrand = useMemo(() => {
        const out = [];
        const conf = [
            { id: "w3", tab: dati.tw3, rows: dati.rw3 },
            { id: "vf", tab: dati.tvf, rows: [...dati.rvf, ...dati.rfw.filter((c) => contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone")].filter((c) => !(/mnp/i.test(String(c.prodotto || "")) && /vodafone|fastweb|\bho\b|ho\./i.test(String(c.provenienza || "")))) },
            { id: "sky", tab: dati.tsky, rows: dati.rsky },
        ];
        for (const c of conf) {
            if (!c.tab) continue;
            const av = calcolaAvanzamento(c.tab, c.rows);
            for (const p of c.tab.piste) {
                const st = av.piste[p.chiave]; if (!st) continue;
                const scala = c.tab.soglie.filter((s) => s.pista === p.chiave).sort((a, b) => a.tier - b.tier);
                if (!scala.length && !st.punti) continue;
                out.push({ brand: c.id, pista: p.chiave, nome: p.nome, st, scala });
            }
        }
        return out;
    }, [dati]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TileBig label="Punti rete" value={agg.punti} delta={agg.punti - aggPrev.punti} sub="vs mese scorso" />
                <TileBig label="Pezzi rete" value={agg.pezzi} punti={false} delta={agg.pezzi - aggPrev.pezzi} sub="registrati" colore="var(--tf-22c55e)" delay={40} />
                <TileBig label="Negozi attivi" value={negozi.length} punti={false} sub="con vendite nel mese" colore="var(--tf-f97316)" delay={80} />
                <TileBig label={meseCorrente ? "Proiezione rete" : "Media/negozio"} value={meseCorrente ? (proi ?? "—") : (negozi.length ? agg.punti / negozi.length : 0)} sub={meseCorrente ? "punti a fine mese" : "punti"} colore="var(--tf-14b8a6)" delay={120} />
            </div>

            <Card title="Le soglie si prendono INSIEME — a che punto è la rete" emoji="🚦" delay={60}>
                <div className="flex flex-wrap justify-around gap-x-6 gap-y-5">
                    {soglieBrand.map(({ brand, pista, nome, st, scala }) => {
                        const colore = GARA[brand].colore;
                        const prossima = st.prossima?.soglia_da ?? null;
                        const kMax = prossima ?? st.soglia?.soglia_da ?? Math.max(1, st.punti);
                        // a questo passo, quante giornate servono per la prossima
                        // soglia? (solo se ci sta dentro il mese)
                        let eta = null;
                        if (meseCorrente && prossima && gl?.trascorsi > 0 && st.punti > 0) {
                            const gServono = Math.ceil((prossima - st.punti) / (st.punti / gl.trascorsi));
                            if (gl.trascorsi + gServono <= gl.totali) eta = gServono;
                        }
                        return (
                            <Ring key={`${brand}-${pista}`} value={st.punti} max={kMax} colore={colore} size={140}
                                centro={<>
                                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{GARA[brand].label}</span>
                                    <span className="text-2xl font-black text-white tabular-nums leading-tight"><Num v={st.punti} punti /></span>
                                    <span className="text-[9px] text-slate-400">{PISTA_LABEL[pista] || nome}</span>
                                    {st.tier > 0 && <span className="mt-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black text-white" style={{ background: `${colore}cc` }}>S{st.tier} presa</span>}
                                </>}
                                sotto={<div className="text-center max-w-[190px]">
                                    {st.gate ? <p className="text-[10px] text-amber-300 font-semibold">⛔ {st.gate}</p>
                                        : prossima ? <p className="text-[10px] text-slate-400">mancano <b className="text-white tabular-nums">{fmtPt(st.mancano ?? prossima - st.punti)}</b> alla S{st.prossima.tier}{eta ? <> · di questo passo <b className="text-emerald-300">~{eta} gg lavorativi</b></> : ""}</p>
                                            : <p className="text-[10px] text-emerald-300 font-semibold">ultima soglia presa 👑</p>}
                                    <div className="mt-1.5"><ScalaSoglie soglie={scala} punti={st.punti} colore={colore} /></div>
                                </div>}
                                tip={<div><TipTitolo>{GARA[brand].label} · {PISTA_LABEL[pista] || nome}</TipTitolo>
                                    <TipRiga l="punti rete" r={fmtPt(st.punti)} colore={colore} />
                                    <TipRiga l="pezzi in pista" r={fmtN(st.pezzi)} />
                                    {scala.map((s) => <TipRiga key={s.tier} l={`Soglia ${s.tier}`} r={`da ${fmtN(s.soglia_da)}${st.punti >= s.soglia_da ? " ✓" : ""}`} />)}
                                </div>}
                            />
                        );
                    })}
                    {!soglieBrand.length && <p className="text-xs text-slate-500 py-6">Nessun tabellare per questo mese.</p>}
                </div>
            </Card>

            <div className="grid lg:grid-cols-3 gap-4">
                <Card title="La corsa dei negozi" emoji="🏁" className="lg:col-span-2" delay={120}>
                    <RaceBars righe={negozi.map((n) => ({
                        k: n.k, label: n.k, val: n.agg.punti, colore: "var(--tf-818cf8)",
                        det: [...detBrand(n.agg), { l: "pezzi", r: fmtN(n.agg.pezzi) }],
                    }))} />
                </Card>
                <Card title="Il mese della rete" emoji="📈" delay={160}>
                    <AreaChart serie={serie} ghost={ghost.length ? ghost : null} oggi={oggi > 0 ? oggi - 1 : -1} colore="var(--tf-e60000)" h={200} />
                    <p className="mt-1 text-[10px] text-slate-500">cumulato punti di tutta la rete · tratteggio = mese scorso</p>
                </Card>
            </div>
        </div>
    );
}

/* ═══ AREA REGIA (solo admin) ══════════════════════════════════════════ */
function AreaRegia({ items, dati, ym, nG, oggi, gl }) {
    const [lente, setLente] = useState("codice"); // "codice" | "negozio"
    const chiave = lente === "codice" ? "cod_ins" : "negozio";
    const gruppi = useMemo(() => classifica(items, chiave), [items, chiave]);

    // gare AZIENDALI (tabellari lato azienda): soglie, vincoli e cancelletti
    const gareAz = useMemo(() => {
        const out = [];
        const conf = [
            { id: "w3", tab: dati.aw3, rows: dati.rw3 },
            { id: "vf", tab: dati.avf, rows: [...dati.rvf, ...dati.rfw.filter((c) => contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone")].filter((c) => !(/mnp/i.test(String(c.prodotto || "")) && /vodafone|fastweb|\bho\b|ho\./i.test(String(c.provenienza || "")))) },
            { id: "sky", tab: dati.asky, rows: dati.rsky },
        ];
        for (const c of conf) {
            if (!c.tab) continue;
            const av = calcolaAvanzamento(c.tab, c.rows);
            for (const p of c.tab.piste) {
                const st = av.piste[p.chiave]; if (!st || (!st.punti && !st.pezzi)) continue;
                out.push({ brand: c.id, pista: p.chiave, nome: p.nome, st, scala: c.tab.soglie.filter((s) => s.pista === p.chiave).sort((a, b) => a.tier - b.tier), malus: c.id === "w3" ? av.malus30Mobile : false, piva: av.pivaMobile });
            }
        }
        return out;
    }, [dati]);

    const cbPezzi = (its) => its.filter((it) => /^customer base/i.test(String(it.categoria || ""))).length;

    return (
        <div className="space-y-4">
            <div className="an-in rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                <p className="text-sm text-fuchsia-100"><b>🎛 Regia</b> — la vista che i negozi non vedono: produzione anche per <b>codice di inserimento</b>, per governare target e gare.</p>
                <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                    {[{ id: "codice", l: "🎯 Codice di inserimento" }, { id: "negozio", l: "🏪 Negozio che registra" }].map((x) => (
                        <button key={x.id} onClick={() => setLente(x.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", lente === x.id ? "bg-fuchsia-500/80 text-white shadow" : "text-slate-400 hover:text-white")}>{x.l}</button>
                    ))}
                </div>
            </div>

            <Card title="Gare aziendali — soglie, vincoli, cancelletti" emoji="🏛" delay={40}>
                <div className="flex flex-wrap justify-around gap-x-6 gap-y-5">
                    {gareAz.map(({ brand, pista, nome, st, scala, malus }) => {
                        const colore = GARA[brand].colore;
                        const kMax = st.prossima?.soglia_da ?? st.soglia?.soglia_da ?? Math.max(1, st.punti);
                        return (
                            <Ring key={`${brand}-${pista}`} value={st.punti} max={kMax} colore={colore} size={128}
                                centro={<>
                                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{GARA[brand].label}</span>
                                    <span className="text-xl font-black text-white tabular-nums"><Num v={st.punti} punti /></span>
                                    <span className="text-[9px] text-slate-400">{PISTA_LABEL[pista] || nome}</span>
                                    {st.tier > 0 && <span className="mt-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black text-white" style={{ background: `${colore}cc` }}>S{st.tier}</span>}
                                </>}
                                sotto={<div className="text-center max-w-[180px]">
                                    {st.gate && <p className="text-[10px] text-amber-300 font-semibold">⛔ {st.gate}</p>}
                                    {malus && pista === "mobile" && <p className="text-[10px] text-rose-300 font-semibold">🔻 malus −30% attivo (fisso S1 o &lt;6 P.IVA)</p>}
                                    {!st.gate && st.prossima && <p className="text-[10px] text-slate-400">mancano <b className="text-white tabular-nums">{fmtPt(st.mancano ?? 0)}</b> alla S{st.prossima.tier}</p>}
                                    {scala.length > 0 && <div className="mt-1"><ScalaSoglie soglie={scala} punti={st.punti} colore={colore} /></div>}
                                </div>}
                                tip={<div><TipTitolo>{GARA[brand].label} · {PISTA_LABEL[pista] || nome} (azienda)</TipTitolo>
                                    <TipRiga l="punti" r={fmtPt(st.punti)} colore={colore} /><TipRiga l="pezzi" r={fmtN(st.pezzi)} />
                                    {scala.map((s) => <TipRiga key={s.tier} l={`S${s.tier}`} r={`da ${fmtN(s.soglia_da)}${st.punti >= s.soglia_da ? " ✓" : ""}`} />)}
                                </div>}
                            />
                        );
                    })}
                    {!gareAz.length && <p className="text-xs text-slate-500 py-4">Nessun tabellare azienda per questo mese.</p>}
                </div>
            </Card>

            <Card title={lente === "codice" ? "Produzione per codice di inserimento" : "Produzione per negozio che registra"} emoji={lente === "codice" ? "🎯" : "🏪"} delay={80}>
                <RaceBars righe={gruppi.map((g) => {
                    const its = items.filter((it) => it[chiave] === g.k);
                    return {
                        k: g.k, label: g.k, val: g.agg.punti, colore: lente === "codice" ? "var(--tf-e879f9)" : "var(--tf-818cf8)",
                        det: [...detBrand(g.agg), { l: "pezzi", r: fmtN(g.agg.pezzi) }, { l: "operazioni CB", r: fmtN(cbPezzi(its)) }],
                    };
                })} />
                <p className="mt-3 text-[10px] text-slate-500">🧩 La CB a <b>punti</b> (Partnership Reward W3: cambi offerta, rivincoli…) arriva col cantiere Partnership — le righe vanno prima condizionate; qui intanto le operazioni CB sono nei tooltip.</p>
            </Card>
        </div>
    );
}
