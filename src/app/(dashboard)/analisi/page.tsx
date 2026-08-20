// @ts-nocheck
"use client";

// ANALISI (Luca 20/08, v2 dopo il suo feedback) — REGOLA CARDINE: «un punto
// Sky è MOLTO diverso da un punto Vodafone, e un punto Vodafone mobile è
// diverso da uno del fisso» → MAI somme di punti tra operatori o piste.
// Le aree Io e Negozio sono GRIGLIE MODULARI come la Home (widget singoli:
// ordine sparso, taglie 1/2/4, galleria, layout per utente in
// app_users.analisi_layout {io:[...], negozio:[...]}), coi dati scoppiati
// per operatore → categoria → dettaglio (finanziati, GA/CB, SIM dati, RS…)
// e la Marginalità come spazio dedicato. Lo store manager vede la squadra
// aggregata E ogni collaboratore (filtro); il consulente è bloccato su di sé.
// Visibilità aperta sugli altri negozi (decisione Luca). Rete e Regia:
// v1, in attesa delle sue direttive. Voce accesa solo admin/dev per ora.
// Quantitativo oggi; lo switch a VALORE arriverà a operatori configurati.

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { seesWholeStore, isAdminOrAbove } from "@/lib/roles";
import { useRolePermissions } from "@/lib/usePermissions";
import { effectiveAllowed, hubByHref, hubChildKey } from "@/lib/nav";
import { caricaTutte } from "@/lib/fetchTutte";
import { giorniLavorativiMese, caricaContrattiMese, caricaTabellare, caricaTabellareAzienda, matchRigheAttivazione, puntiPerRighe, brandIdDaLabel, contestoVfFw, calcolaAvanzamento } from "@/lib/commissioning";
import { SelectOpzioni } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { Loader2, ChevronLeft, ChevronRight, Lock, Plus, X, RotateCcw, GripVertical } from "lucide-react";
import { Num, TipRiga, TipTitolo, Ring, BarStack, RaceBars, ScalaSoglie, fmtPt, fmtN } from "./_charts";
import { REGISTRO, GRUPPI, DEFAULT_LAYOUT, GARA, LogoBrand } from "./_widgets";

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const norm = (s) => String(s || "").trim().toLowerCase();
const sameStore = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
const PISTA_LABEL = { mobile: "Mobile", fisso: "Fisso", assicurazioni: "Assicurazioni", lucegas: "Luce & Gas", sky: "Punti Sky", business_mobile: "Biz mobile", business_fisso: "Biz fisso", cb: "CB", soluzioni_digitali: "Sol. digitali", vas: "VAS", luce: "Luce", gas: "Gas" };

const ymLocale = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; };
const ymISO = ({ y, m }) => `${y}-${String(m).padStart(2, "0")}`;
const ymPrec = ({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
const giorniDelMese = ({ y, m }) => new Date(y, m, 0).getDate();
const SPAN = { 1: "sm:col-span-1", 2: "sm:col-span-2", 4: "sm:col-span-2 xl:col-span-4" };

/* ── arricchimento (lente ragazzi): ogni vendita → punti + campi dettaglio ─ */
function arricchisci(rw3, rvf, rfw, rsky, tw3, tvf, tsky) {
    const items = [];
    const push = (c, brandGara, set, flags = {}) => items.push({
        id: c.id, brandGara,
        negozio: c.negozio || "—", venditore: c.venditore || "—", cod_ins: c.cod_ins || "—",
        g: Number(String(c.data || "").slice(8, 10)) || 0,
        categoria: c.categoria, prodotto: c.prodotto, offerta: c.offerta,
        opzioni: c.opzioni, tipo: c.tipo_cliente,
        pista: set[0]?.pista || null, punti: set.length ? puntiPerRighe(set) : 0,
        ...flags,
    });
    for (const c of rw3) {
        const set = tw3 ? matchRigheAttivazione(tw3.righe, c, brandIdDaLabel(c.brand) || "windtre") : [];
        push(c, "w3", set, { senzaRiga: !set.length });
    }
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

const validaExt = (r) => !/annull/i.test(String(r.stato || "")) && r.nascosta_gestione !== true;

/* ════════════════════════════════════════════════════════════════════════ */
export default function Analisi() {
    const { user } = useAuth();
    // VISIBILITÀ DAI PERMESSI (Luca 21/08): la sezione è un hub — dalla pagina
    // Permessi si abilita tutta (/analisi) o area per area (?sez=io|negozio|
    // rete|regia), per ruolo o singolarmente. Default: solo admin/dev.
    const { perms, loaded: permsLoaded } = useRolePermissions(user?.role, user?.grade, user?.id);
    const hubAnalisi = hubByHref("/analisi");
    const puoSezione = effectiveAllowed(user?.role, "/analisi", hubAnalisi?.roles || ["admin", "dev"], perms);
    const areePermesse = useMemo(() => new Set(
        (hubAnalisi?.children || []).filter((c) => effectiveAllowed(user?.role, hubChildKey(hubAnalisi, c), c.roles ?? hubAnalisi.roles, perms)).map((c) => c.sez),
    ), [user?.role, perms]);
    const vedeTutto = isAdminOrAbove(user?.role) || ["admin", "dev", "direttore_generale", "direttore_commerciale"].includes(user?.role || "");
    const vedeNegozio = seesWholeStore(user?.role);

    const [ym, setYm] = useState(ymLocale());
    const [area, setArea] = useState("io");
    const [dati, setDati] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errore, setErrore] = useState(null);
    const [tentativo, setTentativo] = useState(0);
    const [layoutSalvato, setLayoutSalvato] = useState(null);   // {io:[], negozio:[]}

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErrore(null);
        (async () => {
            const mISO = `${ymISO(ym)}-01`;
            const pv = ymPrec(ym); const pISO = `${ymISO(pv)}-01`;
            const ultimo = `${ymISO(ym)}-${String(giorniDelMese(ym)).padStart(2, "0")}`;
            const ultimoPrev = `${ymISO(pv)}-${String(giorniDelMese(pv)).padStart(2, "0")}`;
            const selExt = (da, a) => (from, to) => supabase.from("contracts")
                .select("id, negozio, venditore, data, stato, nascosta_gestione, prodotto, qty:dettagli->>qty, prezzo:dettagli->>price")
                .like("id", "EXT-%").gte("data", da).lte("data", a).order("id").range(from, to);
            // gli ALTRI operatori (S4, TIM, Iliad…): pezzi per il peso per brand
            const selAltri = (from, to) => supabase.from("contracts")
                .select("id, brand, negozio, venditore, data, categoria, prodotto, stato, nascosta_gestione")
                .like("id", "CTR-%").gte("data", mISO).lte("data", ultimo).order("id").range(from, to);
            try {
                const [rw3, rvf, rfw, rsky, tw3, tvf, tsky, aw3, avf, asky, gl,
                    pw3, pvf, pfw, psky, ptw3, ptvf, ptsky,
                    extRes, extPrevRes, mCats, mItems, layRes, altRes] = await Promise.all([
                        caricaContrattiMese("WindTre", mISO), caricaContrattiMese("Vodafone", mISO),
                        caricaContrattiMese("Fastweb", mISO), caricaContrattiMese("Sky", mISO),
                        caricaTabellare("windtre", mISO), caricaTabellare("vodafone", mISO), caricaTabellare("sky", mISO),
                        caricaTabellareAzienda("windtre", mISO), caricaTabellareAzienda("vodafone", mISO), caricaTabellareAzienda("sky", mISO),
                        giorniLavorativiMese(mISO),
                        caricaContrattiMese("WindTre", pISO), caricaContrattiMese("Vodafone", pISO),
                        caricaContrattiMese("Fastweb", pISO), caricaContrattiMese("Sky", pISO),
                        caricaTabellare("windtre", pISO), caricaTabellare("vodafone", pISO), caricaTabellare("sky", pISO),
                        caricaTutte(selExt(mISO, ultimo)), caricaTutte(selExt(pISO, ultimoPrev)),
                        supabase.from("marg_categories").select("id, name, icon"),
                        supabase.from("marg_items").select("name, category_id"),
                        user?.id ? supabase.from("app_users").select("analisi_layout").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
                        caricaTutte(selAltri),
                    ]);
                if (!alive) return;
                // caricaTutte restituisce { data, error }, NON l'array — il
                // primo deploy passava l'oggetto a .filter e il loader
                // restava appeso per sempre (bug visto da Luca 21/08)
                // prezzo = dettagli.price: TOTALE riga, già moltiplicato per la qty
                const perExt = (res) => (res?.data || []).filter(validaExt).map((r) => ({ negozio: r.negozio || "—", venditore: r.venditore || "—", prodotto: r.prodotto, qty: r.qty, prezzo: Number(r.prezzo) || 0, g: Number(String(r.data || "").slice(8, 10)) || 0 }));
                const catNome = new Map((mCats.data || []).map((c) => [c.id, c.name]));
                const margMap = new Map((mItems.data || []).map((i) => [norm(i.name), { cat: catNome.get(i.category_id) || "Altro" }]));
                const margIcone = new Map((mCats.data || []).map((c) => [c.name, c.icon || "🧩"]));
                setLayoutSalvato(layRes?.data?.analisi_layout || null);
                // brand fuori dalle 4 gare (S4, TIM…): solo pezzi, per il peso per brand
                const gare4 = new Set(["windtre", "vodafone", "fastweb", "sky"]);
                const altri = (altRes?.data || [])
                    .filter((r) => validaExt(r) && !gare4.has(brandIdDaLabel(r.brand) || ""))
                    .map((r) => ({ brand: r.brand || "—", negozio: r.negozio || "—", venditore: r.venditore || "—", categoria: r.categoria, prodotto: r.prodotto, g: Number(String(r.data || "").slice(8, 10)) || 0 }));
                setDati({
                    rw3, rvf, rfw, rsky, tw3, tvf, tsky, aw3, avf, asky, gl,
                    prev: { rw3: pw3, rvf: pvf, rfw: pfw, rsky: psky, tw3: ptw3, tvf: ptvf, tsky: ptsky },
                    ext: perExt(extRes), extPrev: perExt(extPrevRes), margMap, margIcone, altri,
                });
            } catch (e) {
                // mai piu' un loader appeso in silenzio: l'errore si vede e si riprova
                if (alive) setErrore(String(e?.message || e));
            } finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [ym.y, ym.m, user?.id, tentativo]);

    const items = useMemo(() => dati ? arricchisci(dati.rw3, dati.rvf, dati.rfw, dati.rsky, dati.tw3, dati.tvf, dati.tsky) : [], [dati]);
    const itemsPrev = useMemo(() => dati ? arricchisci(dati.prev.rw3, dati.prev.rvf, dati.prev.rfw, dati.prev.rsky, dati.prev.tw3, dati.prev.tvf, dati.prev.tsky) : [], [dati]);

    // ── venditori e negozi del mese (ordinati per PEZZI: mai per somme di punti)
    const venditoriTutti = useMemo(() => {
        const per = new Map();
        for (const it of items) { if (it.venditore === "—") continue; per.set(it.venditore, (per.get(it.venditore) || 0) + 1); }
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [items]);
    const negoziTutti = useMemo(() => {
        const per = new Map();
        for (const it of items) { if (it.negozio === "—") continue; per.set(it.negozio, (per.get(it.negozio) || 0) + 1); }
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [items]);

    // ── persona osservata: consulente = solo sé; store manager = la sua
    //    squadra; direzione/admin = tutti (è anche l'anteprima dei ruoli)
    const opzioniPersona = useMemo(() => {
        if (vedeTutto) return venditoriTutti;
        if (vedeNegozio) {
            const squadra = venditoriTutti.filter((v) => items.some((it) => norm(it.venditore) === norm(v) && sameStore(it.negozio, user?.negozio)));
            return [...new Set([user?.name, ...squadra].filter(Boolean))];
        }
        return [user?.name].filter(Boolean);
    }, [vedeTutto, vedeNegozio, venditoriTutti, items, user?.name, user?.negozio]);
    const [personaSel, setPersonaSel] = useState("");
    const persona = useMemo(() => {
        if (personaSel && opzioniPersona.some((o) => norm(o) === norm(personaSel))) return personaSel;
        const mio = opzioniPersona.find((o) => norm(o) === norm(user?.name));
        return mio || opzioniPersona[0] || "";
    }, [personaSel, opzioniPersona, user?.name]);

    const mieiItems = useMemo(() => items.filter((it) => norm(it.venditore) === norm(persona)), [items, persona]);
    const mieiNegozi = useMemo(() => {
        const per = new Map();
        for (const it of mieiItems) per.set(it.negozio, (per.get(it.negozio) || 0) + 1);
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [mieiItems]);
    const negozioCasa = mieiNegozi[0] || (user?.negozio && negoziTutti.find((n) => sameStore(n, user.negozio))) || negoziTutti[0] || "";

    // ── negozio osservato + filtro collaboratore (aggregato o individuale)
    const [negozioSel, setNegozioSel] = useState("");
    const negozio = useMemo(() => {
        if (negozioSel && negoziTutti.includes(negozioSel)) return negozioSel;
        return negozioCasa;
    }, [negozioSel, negoziTutti, negozioCasa]);
    const [collabSel, setCollabSel] = useState("");
    const TUTTI = "👥 Tutta la squadra";
    const squadraNegozio = useMemo(() => {
        const per = new Map();
        for (const it of items) { if (norm(it.negozio) !== norm(negozio) || it.venditore === "—") continue; per.set(it.venditore, (per.get(it.venditore) || 0) + 1); }
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [items, negozio]);
    const collab = collabSel && collabSel !== TUTTI && squadraNegozio.some((s) => norm(s) === norm(collabSel)) ? collabSel : "";
    useEffect(() => { setCollabSel(""); }, [negozio]);

    const oggi = useMemo(() => { const d = new Date(); return d.getFullYear() === ym.y && d.getMonth() + 1 === ym.m ? d.getDate() : -1; }, [ym]);
    const nG = giorniDelMese(ym);
    const meseCorrente = oggi > 0;

    // ── contesti dei widget (Io e Negozio) ─────────────────────────────────
    const base = { itemsRete: items, margMap: dati?.margMap, margIcone: dati?.margIcone, nG, ym, oggi, gl: dati?.gl, meseCorrente, negoziTutti, extRete: dati?.ext || [], altriRete: dati?.altri || [] };
    const ctxIo = useMemo(() => ({
        ...base, areaKey: "io",
        items: mieiItems,
        itemsPrev: itemsPrev.filter((it) => norm(it.venditore) === norm(persona)),
        itemsStore: items.filter((it) => norm(it.negozio) === norm(negozioCasa)),
        ext: (dati?.ext || []).filter((r) => norm(r.venditore) === norm(persona)),
        extPrev: (dati?.extPrev || []).filter((r) => norm(r.venditore) === norm(persona)),
        persona, negozio: negozioCasa, negozioCasa,
    }), [items, itemsPrev, mieiItems, persona, negozioCasa, dati, nG, ym, oggi, meseCorrente, negoziTutti]);
    const ctxNegozio = useMemo(() => {
        const store = items.filter((it) => norm(it.negozio) === norm(negozio));
        const scoped = collab ? store.filter((it) => norm(it.venditore) === norm(collab)) : store;
        const extStore = (dati?.ext || []).filter((r) => norm(r.negozio) === norm(negozio));
        return {
            ...base, areaKey: "negozio",
            items: scoped,
            itemsPrev: itemsPrev.filter((it) => norm(it.negozio) === norm(negozio) && (!collab || norm(it.venditore) === norm(collab))),
            itemsStore: store,
            ext: collab ? extStore.filter((r) => norm(r.venditore) === norm(collab)) : extStore,
            extPrev: (dati?.extPrev || []).filter((r) => norm(r.negozio) === norm(negozio) && (!collab || norm(r.venditore) === norm(collab))),
            persona: collab || persona, negozio, negozioCasa: negozio,
        };
    }, [items, itemsPrev, negozio, collab, persona, dati, nG, ym, oggi, meseCorrente, negoziTutti]);

    // ── layout per area (app_users.analisi_layout) ────────────────────────
    const decode = (arr) => (Array.isArray(arr) ? arr : []).map((s) => { const [k, t] = String(s).split("@"); return REGISTRO[k] ? { k, s: [1, 2, 4].includes(Number(t)) ? Number(t) : (REGISTRO[k].def || 1) } : null; }).filter(Boolean);
    const [layoutIo, setLayoutIo] = useState(null);
    const [layoutNeg, setLayoutNeg] = useState(null);
    useEffect(() => {
        if (loading) return;
        setLayoutIo((cur) => cur ?? (decode(layoutSalvato?.io).length ? decode(layoutSalvato.io) : decode(DEFAULT_LAYOUT.io)));
        setLayoutNeg((cur) => cur ?? (decode(layoutSalvato?.negozio).length ? decode(layoutSalvato.negozio) : decode(DEFAULT_LAYOUT.negozio)));
    }, [loading, layoutSalvato]);
    const salva = async (areaKey, lista) => {
        const next = { ...(layoutSalvato || {}), [areaKey]: lista.map((w) => `${w.k}@${w.s}`) };
        setLayoutSalvato(next);
        try { if (user?.id) await supabase.from("app_users").update({ analisi_layout: next }).eq("id", user.id); } catch { /* offline: resta locale */ }
    };

    const TUTTE_LE_AREE = [
        { id: "io", emoji: "👤", label: "Io" },
        { id: "negozio", emoji: "🏪", label: "Negozio" },
        { id: "rete", emoji: "🌍", label: "Rete" },
        { id: "regia", emoji: "🎛", label: "Regia" },
    ];
    const AREE = TUTTE_LE_AREE.filter((a) => areePermesse.has(a.id));
    // se l'area corrente non è (più) permessa, si scivola sulla prima concessa
    useEffect(() => {
        if (permsLoaded && AREE.length && !areePermesse.has(area)) setArea(AREE[0].id);
    }, [permsLoaded, areePermesse, area]);

    if (!permsLoaded) {
        return <div className="flex items-center justify-center py-24 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carico…</div>;
    }
    if (!puoSezione || !AREE.length) {
        return (
            <div className="min-h-[60vh] grid place-items-center">
                <div className="glass-card rounded-2xl p-10 text-center max-w-sm">
                    <Lock className="w-8 h-8 mx-auto text-slate-500" />
                    <p className="mt-3 text-white font-bold">Analisi in anteprima</p>
                    <p className="mt-1 text-sm text-slate-400">{puoSezione ? "Nessuna area è abilitata per il tuo ruolo: si accendono dai Permessi." : "La sezione sta per aprirsi a tutta la rete. Ancora qualche giorno. 👀"}</p>
                </div>
            </div>
        );
    }

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
                        <p className="text-xs text-slate-400 mt-1">Tutto scoppiato per operatore e categoria — i punti non si sommano mai tra brand.</p>
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
                    {area === "io" && opzioniPersona.length > 1 && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>Guarda:</span>
                            <SelectOpzioni value={persona} onChange={(v) => setPersonaSel(v)} opzioni={opzioniPersona} placeholder="venditore…" className="min-w-[190px]" />
                        </div>
                    )}
                    {area === "negozio" && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>Negozio:</span>
                            <SelectOpzioni value={negozio} onChange={(v) => setNegozioSel(v)} opzioni={negoziTutti} placeholder="negozio…" className="min-w-[170px]" />
                            <span className="pl-1">Collaboratore:</span>
                            <SelectOpzioni value={collab || TUTTI} onChange={(v) => setCollabSel(v)} opzioni={[TUTTI, ...squadraNegozio]} placeholder="tutti…" className="min-w-[180px]" />
                        </div>
                    )}
                </div>
            </div>

            {errore && !loading ? (
                <div className="glass-card rounded-2xl p-8 text-center an-in">
                    <p className="text-sm font-bold text-rose-300">Qualcosa è andato storto nel caricamento</p>
                    <p className="mt-1 text-xs text-slate-500 break-all max-w-lg mx-auto">{errore}</p>
                    <button onClick={() => setTentativo((t) => t + 1)} className="mt-4 px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-sm font-bold text-white hover:bg-white/15 transition-colors">↻ Riprova</button>
                </div>
            ) : loading || !dati ? (
                <div className="flex items-center justify-center py-24 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carico il motore delle gare…</div>
            ) : (
                <>
                    {area === "io" && layoutIo && (
                        <GrigliaWidget key={`io-${persona}-${ymISO(ym)}`} areaKey="io" ctx={ctxIo} lista={layoutIo}
                            setLista={(l) => { setLayoutIo(l); salva("io", l); }} intestazione={`👤 ${persona || "—"}${mieiNegozi.length ? ` · ${mieiNegozi.join(" + ")}` : ""}`} />
                    )}
                    {area === "negozio" && layoutNeg && (
                        <GrigliaWidget key={`ng-${negozio}-${collab}-${ymISO(ym)}`} areaKey="negozio" ctx={ctxNegozio} lista={layoutNeg}
                            setLista={(l) => { setLayoutNeg(l); salva("negozio", l); }} intestazione={collab ? `🏪 ${negozio} · 👤 ${collab} (individuale)` : `🏪 ${negozio} · tutta la squadra`} />
                    )}
                    {area === "rete" && <AreaRete key={`rt-${ymISO(ym)}`} {...{ items, itemsPrev, dati, ym, nG, oggi, gl: dati.gl, meseCorrente }} />}
                    {area === "regia" && areePermesse.has("regia") && <AreaRegia key={`rg-${ymISO(ym)}`} {...{ items, dati, ym, nG, oggi, gl: dati.gl }} />}
                </>
            )}
        </div>
    );
}

/* ═══ GRIGLIA MODULARE (come la Home: drag, taglie, galleria) ══════════ */
function GrigliaWidget({ areaKey, ctx, lista, setLista, intestazione }) {
    const [galleria, setGalleria] = useState(false);
    const dragDa = useRef(null);
    const muovi = (da, a) => { if (a < 0 || a >= lista.length) return; const next = [...lista]; const [w] = next.splice(da, 1); next.splice(a, 0, w); setLista(next); };
    const taglia = (i) => { const next = [...lista]; next[i] = { ...next[i], s: next[i].s === 1 ? 2 : next[i].s === 2 ? 4 : 1 }; setLista(next); };
    const rimuovi = (i) => setLista(lista.filter((_, j) => j !== i));
    const aggiungi = (k) => { setLista([...lista, { k, s: REGISTRO[k].def || 1 }]); setGalleria(false); };
    const presenti = new Set(lista.map((w) => w.k));
    const disponibili = Object.entries(REGISTRO).filter(([k, d]) => !presenti.has(k) && (!d.solo || d.solo === areaKey));

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-3 an-in">
                <p className="text-xs font-bold text-slate-300">{intestazione}</p>
                <div className="flex gap-1.5">
                    <button onClick={() => setGalleria(true)} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 hover:bg-white/10 transition-colors inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Aggiungi</button>
                    <button onClick={() => setLista(DEFAULT_LAYOUT[areaKey].map((s) => { const [k, t] = s.split("@"); return { k, s: Number(t) }; }))} title="Ripristina layout" className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-colors"><RotateCcw className="w-3 h-3" /></button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" style={{ gridAutoFlow: "row dense" }}>
                {lista.map((w, i) => {
                    const def = REGISTRO[w.k]; if (!def) return null;
                    return (
                        <div key={`${w.k}-${i}`} className={cn("glass-card an-card rounded-2xl p-4 an-in group/wg", SPAN[w.s])} style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
                            onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragDa.current != null) muovi(dragDa.current, i); dragDa.current = null; }}>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5 min-w-0">
                                    <span draggable onDragStart={() => { dragDa.current = i; }} className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300 shrink-0"><GripVertical className="w-3.5 h-3.5" /></span>
                                    {/* le carte operatore parlano col LOGO nel corpo: qui niente doppioni */}
                                    {def.senzaTitolo ? null : def.logoChiave
                                        ? <span className="flex items-center gap-1.5 min-w-0"><span className="truncate">{def.emoji} {def.nomeBreve || def.nome}</span><LogoBrand chiave={def.logoChiave} h={16} /></span>
                                        : <span className="truncate">{def.emoji} {def.nome}</span>}
                                </p>
                                <div className="flex gap-0.5 opacity-0 group-hover/wg:opacity-100 transition-opacity shrink-0">
                                    <button onClick={() => muovi(i, i - 1)} title="Sposta prima" className="px-1.5 py-0.5 rounded-md text-[10px] text-slate-400 hover:bg-white/10">◀</button>
                                    <button onClick={() => muovi(i, i + 1)} title="Sposta dopo" className="px-1.5 py-0.5 rounded-md text-[10px] text-slate-400 hover:bg-white/10">▶</button>
                                    <button onClick={() => taglia(i)} title="Cambia taglia" className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-400 hover:bg-white/10">{w.s === 1 ? "1️⃣" : w.s === 2 ? "2️⃣" : "🖥"}</button>
                                    <button onClick={() => rimuovi(i)} title="Rimuovi" className="px-1.5 py-0.5 rounded-md text-[10px] text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"><X className="w-3 h-3" /></button>
                                </div>
                            </div>
                            {def.render(ctx, w.s)}
                        </div>
                    );
                })}
            </div>
            {!lista.length && <p className="text-center text-xs text-slate-500 py-10">Griglia vuota — «＋ Aggiungi» per popolare l'area.</p>}

            {galleria && (
                <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setGalleria(false)}>
                    <div className="glass-card rounded-2xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-black text-white">＋ Aggiungi un widget</p>
                            <button onClick={() => setGalleria(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><X className="w-4 h-4" /></button>
                        </div>
                        {GRUPPI.map((g) => {
                            const del = disponibili.filter(([, d]) => d.gruppo === g);
                            if (!del.length) return null;
                            return (
                                <div key={g} className="mb-4">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">{g}</p>
                                    <div className="grid sm:grid-cols-2 gap-2">
                                        {del.map(([k, d]) => (
                                            <button key={k} onClick={() => aggiungi(k)} className="text-left px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors">
                                                <span className="text-xs font-bold text-slate-200">{d.emoji} {d.nome}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        {!disponibili.length && <p className="text-xs text-slate-500 text-center py-6">Hai già tutti i widget di quest'area. 🎉</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ═══ AREA RETE (v1 — in attesa delle direttive di Luca) ═══════════════ */
function AreaRete({ items, itemsPrev, dati, ym, nG, oggi, gl, meseCorrente }) {
    // produzione GIORNALIERA impilata per operatore (Luca 21/08: mai cumulati)
    const giorniRete = useMemo(() => {
        const v = Array.from({ length: nG }, (_, i) => ({ n: i + 1, label: `${String(i + 1).padStart(2, "0")} ${MESI[ym.m - 1]}`, tot: 0, _p: new Map() }));
        for (const it of items) {
            if (it.g < 1 || it.g > nG) continue;
            const g = v[it.g - 1]; const G = GARA[it.brandGara];
            const e = g._p.get(G.label) || { label: G.label, colore: G.colore, val: 0 };
            e.val++; g._p.set(G.label, e); g.tot++;
        }
        return v.map((g) => ({ n: g.n, label: g.label, tot: g.tot, parti: [...g._p.values()].sort((a, b) => b.val - a.val) }));
    }, [items, nG, ym]);
    const mediaRete = useMemo(() => {
        const tot = giorniRete.reduce((s, g) => s + g.tot, 0);
        const gLav = meseCorrente ? Math.max(1, gl?.trascorsi || 1) : (gl?.totali || nG);
        return tot > 0 ? Math.round((tot / gLav) * 10) / 10 : null;
    }, [giorniRete, gl, meseCorrente, nG]);

    const negoziPezzi = useMemo(() => {
        const per = new Map();
        for (const it of items) { if (it.negozio === "—") continue; (per.get(it.negozio) || per.set(it.negozio, []).get(it.negozio)).push(it); }
        return [...per.entries()].map(([k, its]) => ({ k, its })).sort((a, b) => b.its.length - a.its.length);
    }, [items]);

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
            <div className="glass-card an-card rounded-2xl p-4 an-in">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-3">🚦 Le soglie si prendono INSIEME — a che punto è la rete</p>
                <div className="flex flex-wrap justify-around gap-x-6 gap-y-5">
                    {soglieBrand.map(({ brand, pista, nome, st, scala }) => {
                        const colore = GARA[brand].colore;
                        const prossima = st.prossima?.soglia_da ?? null;
                        const kMax = prossima ?? st.soglia?.soglia_da ?? Math.max(1, st.punti);
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
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
                <div className="glass-card an-card rounded-2xl p-4 an-in lg:col-span-2">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-3">🏁 La corsa dei negozi (per pezzi; i punti brand per brand nel dettaglio)</p>
                    <RaceBars unit="pz" righe={negoziPezzi.map(({ k, its }) => ({
                        k, label: k, val: its.length, colore: "var(--tf-818cf8)",
                        det: Object.entries(GARA).map(([b, g]) => { const sue = its.filter((it) => it.brandGara === b); return sue.length ? { l: g.label, r: `${sue.length} pz · ${fmtPt(sue.reduce((s, x) => s + x.punti, 0))} pt`, colore: g.colore } : null; }).filter(Boolean),
                    }))} />
                </div>
                <div className="glass-card an-card rounded-2xl p-4 an-in">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-3">📊 La rete giorno per giorno (pezzi, per operatore)</p>
                    <BarStack giorni={giorniRete} oggi={oggi > 0 ? oggi - 1 : -1} media={mediaRete} unit="pz" h={200} />
                </div>
            </div>
        </div>
    );
}

/* ═══ AREA REGIA (v1 — in attesa delle direttive di Luca) ══════════════ */
function AreaRegia({ items, dati, ym, nG, oggi, gl }) {
    const [lente, setLente] = useState("codice");
    const chiave = lente === "codice" ? "cod_ins" : "negozio";
    const gruppi = useMemo(() => {
        const per = new Map();
        for (const it of items) { const k = it[chiave]; if (!k || k === "—") continue; (per.get(k) || per.set(k, []).get(k)).push(it); }
        return [...per.entries()].map(([k, its]) => ({ k, its })).sort((a, b) => b.its.length - a.its.length);
    }, [items, chiave]);

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
                out.push({ brand: c.id, pista: p.chiave, nome: p.nome, st, scala: c.tab.soglie.filter((s) => s.pista === p.chiave).sort((a, b) => a.tier - b.tier), malus: c.id === "w3" ? av.malus30Mobile : false });
            }
        }
        return out;
    }, [dati]);

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

            <div className="glass-card an-card rounded-2xl p-4 an-in">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-3">🏛 Gare aziendali — soglie, vincoli, cancelletti</p>
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
            </div>

            <div className="glass-card an-card rounded-2xl p-4 an-in">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-3">{lente === "codice" ? "🎯 Produzione per codice di inserimento (pezzi; punti brand per brand nel dettaglio)" : "🏪 Produzione per negozio che registra (pezzi; punti nel dettaglio)"}</p>
                <RaceBars unit="pz" righe={gruppi.map(({ k, its }) => ({
                    k, label: k, val: its.length, colore: lente === "codice" ? "var(--tf-e879f9)" : "var(--tf-818cf8)",
                    det: [
                        ...Object.entries(GARA).map(([b, g]) => { const sue = its.filter((it) => it.brandGara === b); return sue.length ? { l: g.label, r: `${sue.length} pz · ${fmtPt(sue.reduce((s, x) => s + x.punti, 0))} pt`, colore: g.colore } : null; }).filter(Boolean),
                        { l: "operazioni CB", r: fmtN(its.filter((it) => /^customer base/i.test(String(it.categoria || ""))).length) },
                    ],
                }))} />
                <p className="mt-3 text-[10px] text-slate-500">🧩 La CB a <b>punti</b> (Partnership Reward W3) arriva col cantiere Partnership — le righe vanno prima condizionate; qui intanto le operazioni CB sono nei tooltip.</p>
            </div>
        </div>
    );
}
