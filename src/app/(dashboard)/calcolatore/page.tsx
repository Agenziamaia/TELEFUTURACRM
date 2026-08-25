"use client";

// CALCOLATORE $$$ (cantiere GARE 10/08, richiesta Luca) — un "registra
// vendita riassunto": pochi click (brand → offerta dal CATALOGO vero) e ti
// dice il commissioning di quella vendita alla soglia scelta. La soglia è
// preselezionata su quella LIVE di rete del mese (motore pay tabellare).
// Le offerte SENZA riga di commissioning sono evidenziate (scoperture):
// per regola non generano pay — quando si tocca il catalogo va aggiunta
// anche la riga di commissioning.
// ⚠️ REGOLA DEL PONTE (Luca 25/08, docs/PONTE_GARE_CALCOLATORE_ANALISI.md):
// questo calcolatore resta allineato alle Gare DA SOLO perché usa il
// catalogo vero (pillole opzioni = catalog_opzioni dell'offerta) e il
// motore vero (matchRigheAttivazione con le opzioni scelte) — MAI calcoli
// o liste di opzioni hardcodate qui dentro.
import { useEffect, useMemo, useState } from "react";
import { Calculator, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import {
    CONTESTI_LABEL, ContrattoPay, PayRiga, PaySoglia, Tabellare,
    calcolaAvanzamento, caricaContrattiContesto, caricaTabellare, caricaTabellareAzienda, matchRigheAttivazione, matchRigaTabellare, giorniLavorativiMese, payPerRiga, payEuroAttivazione, puntiPerRighe, esclusaDalleGare, sostituzioneSim,
} from "@/lib/commissioning";

type Cat = { id: string; nome: string; ordine: number };
type Prod = { id: string; categoria_id: string; tipo_cliente: string; nome: string; ordine: number; attivo: boolean | null };
type Off = { id: string; prodotto_id: string; nome: string; ordine: number; attivo: boolean | null; canone_mensile: number | null };

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

// CONTESTI (mappa Luca 10/08 + correzione): lato RAGAZZI tutto il Vodafone
// paga come Vodafone Store (lettera A) — niente scelta; il FASTWEB invece ha
// due lettere e l'allocazione segue il CODICE DI INSERIMENTO (contestoVfFw
// in lib/commissioning). La distinzione VND è solo lato azienda (futuro).
const CONTESTI_BRAND: Record<string, { key: string; label: string }[]> = {
    fastweb: [
        { key: "fastweb", label: "🏬 Multibrand · T2" },
        { key: "vodafone", label: "🅰️ Sui Vodafone Store · T1 (lettera A VS)" },
    ],
};

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
    const [contrattiCtx, setContrattiCtx] = useState<ContrattoPay[] | null>(null);
    const [caricaTab, setCaricaTab] = useState(false);
    const [nonAlloc, setNonAlloc] = useState(0);
    const [escluseVf, setEscluseVf] = useState(0);

    // ── VISTA AZIENDA (Luca 12/08): doppio click sul titolo, solo admin — il
    // Calcolatore passa a soglie e pay del lato azienda. Su WindTre il pay
    // varia per punto vendita: selettore PDV con le soglie del Target mensile
    // (pay_target_pdv) e la produzione allocata col codice di inserimento.
    const { user } = useAuth();
    const isAdmin = user?.role === "admin" || user?.role === "dev";
    const [latoAzienda, setLatoAzienda] = useState(false);
    type PdvRow = { id: string; cod_gara: string | null; negozio: string; cluster_mobile: string | null; soglie_mobile: number[] | null; soglie_fisso: number[] | null; soglie_piva: number[] | null };
    const [pdvList, setPdvList] = useState<PdvRow[]>([]);
    const [pdvSel, setPdvSel] = useState<string | null>(null);     // id riga pay_target_pdv, null = rete

    // PROSPECT (task Luca 11/08): giorni lavorativi del mese (lun-sab meno
    // festivi, override amministrabile) → la soglia si preseleziona sulla
    // PROIEZIONE a fine mese, col dato attuale sempre visibile.
    const [gl, setGl] = useState<Awaited<ReturnType<typeof giorniLavorativiMese>> | null>(null);
    useEffect(() => {
        let vivo = true;
        setGl(null);
        giorniLavorativiMese(monthISO).then(v => { if (vivo) setGl(v); });
        return () => { vivo = false; };
    }, [monthISO]);
    // proiezione visibile solo dal giorno impostato (Gare → Calendario gare)
    const proiezioneOn = !!(gl && gl.trascorsi > 0 && gl.mostraProiezione);
    const proietta = (punti: number) =>
        gl && gl.trascorsi > 0 ? Math.round((punti / gl.trascorsi) * gl.totali * 100) / 100 : punti;

    // contesto lettera di gara (solo VF/FW ne hanno due)
    const [ctx, setCtx] = useState<string | null>(null);
    const ctxOpzioni = brand ? CONTESTI_BRAND[brand] || null : null;
    const ctxKey = ctxOpzioni ? (ctx || ctxOpzioni[0].key) : brand;

    // selezione
    const [tipoCli, setTipoCli] = useState<string | null>(null);
    const [catId, setCatId] = useState<string | null>(null);
    const [prodId, setProdId] = useState<string | null>(null);
    const [offId, setOffId] = useState<string | null>(null);
    const [tierSel, setTierSel] = useState<number | null>(null);   // null = non ancora toccata (usa live)
    // PROVENIENZA (Luca 12/08): alcune righe pay valgono solo per certe
    // provenienze (TIM +10 da Iliad/Coop/Poste, Kena STAR) — null = standard
    const [provSel, setProvSel] = useState<string | null>(null);
    // OPZIONI della vendita (S4 25/08): le righe ancorate a `opzione` (fasce
    // di consumo business S4, kit Protecta W3…) non matchano senza — qui si
    // scelgono con le pillole e viaggiano nel match come in Registra Vendita
    const [opzSel, setOpzSel] = useState<string[]>([]);
    // OPZIONI A CATALOGO dell'offerta selezionata (ponte 25/08: sul fisso W3
    // GA/GNP · FTTC/FTTH · Illimitate decidono il pay ma non erano offerte —
    // le pillole nascevano solo dalle righe `opzione`). Fonte = catalogo,
    // come Registra Vendita: un'opzione nuova compare qui da sola.
    type OpzCat = { nome: string; gruppo: string | null; obb: boolean; ordine: number };
    const [opzCatalogo, setOpzCatalogo] = useState<OpzCat[]>([]);
    useEffect(() => {
        if (!offId) { setOpzCatalogo([]); return; }
        let vivo = true;
        supabase.from("catalog_opzioni").select("nome, gruppo_singolo, obbligatoria, ordine").eq("offerta_id", offId).eq("attivo", true).order("ordine")
            .then(({ data }) => {
                if (!vivo) return;
                setOpzCatalogo(((data || []) as { nome: string; gruppo_singolo: string | null; obbligatoria: boolean | null; ordine: number }[])
                    .map(o => ({ nome: o.nome, gruppo: o.gruppo_singolo, obb: !!o.obbligatoria, ordine: Number(o.ordine || 0) })));
            });
        return () => { vivo = false; };
    }, [offId]);
    // toggle con esclusività di gruppo (una sola per gruppo_singolo)
    const togOpzCalc = (nome: string) => {
        const o = opzCatalogo.find(x => x.nome === nome);
        setOpzSel(prev => {
            if (prev.includes(nome)) return prev.filter(x => x !== nome);
            if (o?.gruppo) {
                const stesso = new Set(opzCatalogo.filter(x => x.gruppo === o.gruppo).map(x => x.nome));
                return [...prev.filter(x => !stesso.has(x)), nome];
            }
            return [...prev, nome];
        });
        setTierSel(null);
    };
    const [mostraScoperte, setMostraScoperte] = useState(false);

    useEffect(() => {
        if (!brand) return;
        let vivo = true;
        setCaricaCat(true); setCtx(null);
        setTipoCli(null); setCatId(null); setProdId(null); setOffId(null); setTierSel(null); setProvSel(null); setOpzSel([]);
        (async () => {
            const [cRes, pRes] = await Promise.all([
                supabase.from("catalog_categorie").select("id, nome, ordine").order("ordine").limit(500),
                supabase.from("catalog_prodotti").select("id, categoria_id, tipo_cliente, nome, ordine, attivo").eq("brand_id", brand).order("ordine").limit(500),
            ]);
            const prodotti = ((pRes.data || []) as Prod[]).filter(p => p.attivo !== false);
            const ids = prodotti.map(p => p.id);
            const oRes = ids.length
                ? await supabase.from("catalog_offerte").select("id, prodotto_id, nome, ordine, attivo, canone_mensile").in("prodotto_id", ids).order("ordine").limit(2000)
                : { data: [] as Off[] };
            if (!vivo) return;
            setCats((cRes.data || []) as Cat[]);
            setProds(prodotti);
            setOffs(((oRes.data || []) as Off[]).filter(o => o.attivo !== false));
            setCaricaCat(false);
        })();
        return () => { vivo = false; };
    }, [brand, monthISO]);

    // tabellare + avanzamento seguono il CONTESTO (lettera di gara), non il brand
    useEffect(() => {
        if (!brand || !ctxKey) return;
        let vivo = true;
        setCaricaTab(true); setTab(null); setContrattiCtx(null); setNonAlloc(0); setTierSel(null); setPdvSel(null);
        (async () => {
            // vista azienda: tabellare azienda; se non esiste (TIM/Kena: la
            // lettera vale per entrambi i lati) si ricade su quello ragazzi
            const t = latoAzienda
                ? (await caricaTabellareAzienda(ctxKey, monthISO)) ?? await caricaTabellare(ctxKey, monthISO)
                : await caricaTabellare(ctxKey, monthISO);
            if (!vivo) return;
            setTab(t);
            if (t) {
                const bm = BRANDS.find(b => b.id === brand);
                const { contratti, nonAllocate, escluseVodafone } = await caricaContrattiContesto(ctxKey, monthISO, bm?.prefix);
                if (!vivo) return;
                setNonAlloc(nonAllocate); setEscluseVf(escluseVodafone);
                setContrattiCtx(contratti);
            }
            setCaricaTab(false);
        })();
        return () => { vivo = false; };
    }, [brand, ctxKey, monthISO, latoAzienda]);

    // target per punto vendita (solo vista azienda WindTre)
    useEffect(() => {
        if (!latoAzienda || ctxKey !== "windtre") { setPdvList([]); return; }
        let vivo = true;
        supabase.from("pay_target_pdv").select("id, cod_gara, negozio, cluster_mobile, soglie_mobile, soglie_fisso, soglie_piva")
            .eq("brand", "windtre").eq("month", monthISO).order("negozio")
            .then(({ data }) => { if (vivo) setPdvList((data || []) as PdvRow[]); });
        return () => { vivo = false; };
    }, [latoAzienda, ctxKey, monthISO]);
    const pdvRow = pdvSel ? pdvList.find(p => p.id === pdvSel) || null : null;

    // tabellare EFFETTIVO: col PDV scelto le soglie di mobile/fisso diventano
    // quelle del suo Target mensile (la scala si ricostruisce dagli importi)
    const tabEff = useMemo(() => {
        if (!tab || !pdvRow) return tab;
        const scala = (pista: string, arr: number[] | null | undefined): PaySoglia[] =>
            (arr || []).map((v, i) => ({ pista, tier: i + 1, soglia_da: Number(v), soglia_a: i < (arr as number[]).length - 1 ? Number((arr as number[])[i + 1]) - 1 : null }));
        const override: Record<string, PaySoglia[]> = {};
        if (pdvRow.soglie_mobile?.length) override.mobile = scala("mobile", pdvRow.soglie_mobile);
        if (pdvRow.soglie_fisso?.length) override.fisso = scala("fisso", pdvRow.soglie_fisso);
        const soglie = [
            ...tab.soglie.filter(s => !override[s.pista]),
            ...Object.values(override).flat(),
        ];
        return { ...tab, soglie };
    }, [tab, pdvRow]);

    // produzione del PDV: le vendite si allocano col CODICE DI INSERIMENTO
    // (regola W3: i codici portano il nome del punto vendita della gara)
    const contrattiEff = useMemo(() => {
        if (!contrattiCtx) return null;
        if (!pdvRow) return contrattiCtx;
        const nk = String(pdvRow.negozio || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return contrattiCtx.filter(c => String(c.cod_ins || "").toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(nk));
    }, [contrattiCtx, pdvRow]);

    const avz = useMemo(
        () => (tabEff && contrattiEff ? calcolaAvanzamento(tabEff, contrattiEff) : null),
        [tabEff, contrattiEff]);

    // albero derivato
    // ordine FISSO: prima Consumer poi Business (segnalazione Luca 10/08 — l'ordine
    // del catalogo variava da brand a brand)
    const tipiCliente = useMemo(() =>
        [...new Set(prods.map(p => p.tipo_cliente).filter(Boolean))]
            .sort((a, b) => (a === "Consumer" ? -1 : b === "Consumer" ? 1 : a.localeCompare(b))),
    [prods]);
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
    // Sostituzioni SIM ed Easy Control: mai commissioning né punti (regola aziendale)
    const esclusaProd = !!(prodSel && sostituzioneSim({ categoria: catSel?.nome, prodotto: prodSel.nome }));
    const esclusaSel = esclusaProd || !!(offSel && esclusaDalleGare({ categoria: catSel?.nome, prodotto: prodSel?.nome, offerta: offSel.nome }));

    // le provenienze che questo tabellare distingue (token → etichetta leggibile)
    const provOpzioni = useMemo(() => {
        if (!tab) return [];
        const set = new Set<string>();
        tab.righe.forEach(r => String(r.provenienza || "").split(",").forEach(t => { const x = t.trim(); if (x) set.add(x); }));
        const LABEL: Record<string, string> = { iliad: "Iliad", coop: "CoopVoce", poste: "PosteMobile", fastweb: "Fastweb" };
        return Array.from(set).map(t => ({ token: t, label: LABEL[t] || t }));
    }, [tab]);

    // OPZIONI che il tabellare distingue per QUESTA selezione (S4: fasce di
    // consumo business; W3: kit Protecta…): righe con `opzione` compatibili
    // con tipo/categoria/prodotto/offerta scelti — i loro nomi diventano
    // pillole qui sotto, senza le quali quelle righe non pagano
    const opzRilevanti = useMemo(() => {
        if (!tab || !offSel || !prodSel || !catSel) return [];
        const eqci = (a: unknown, b: unknown) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
        const set = new Set<string>();
        for (const r of tab.righe) {
            if (!r.attivo || !r.opzione || !String(r.opzione).trim()) continue;
            if (r.componente || r.pista === "partnership") continue;
            if (r.tipo_cliente != null && !eqci(r.tipo_cliente, prodSel.tipo_cliente)) continue;
            if (r.categoria != null && !eqci(r.categoria, catSel.nome)) continue;
            if (r.prodotto != null && !eqci(r.prodotto, prodSel.nome)) continue;
            if (r.offerta != null && !eqci(r.offerta, offSel.nome)) continue;
            String(r.opzione).split("|").forEach(t => { const x = t.trim(); if (x) set.add(x); });
        }
        return Array.from(set);
    }, [tab, offSel, prodSel, catSel]);
    // per il SOLO controllo di copertura (bordo ambra e lista scoperture): con
    // tutte le opzioni concesse, una riga ancorata all'opzione È copertura
    const tutteOpzioni = useMemo(() => {
        if (!tab) return null;
        const set = new Set<string>();
        tab.righe.forEach(r => String(r.opzione || "").split("|").forEach(t => { const x = t.trim(); if (x) set.add(x); }));
        return set.size ? Array.from(set).join(", ") : null;
    }, [tab]);

    // risoluzione righe pay: set ADDITIVO (componenti W3: base + MNP + Tied +
    // P.IVA…) o singola riga classica — la prima riga porta i metadati
    const righeSet: PayRiga[] = useMemo(() => {
        if (!tab || !offSel || !prodSel || !catSel) return [];
        return matchRigheAttivazione(tab.righe, {
            tipo_cliente: prodSel.tipo_cliente, categoria: catSel.nome, prodotto: prodSel.nome, offerta: offSel.nome,
            provenienza: provSel, opzioni: opzSel.length ? opzSel.join(", ") : null,
        }, brand);
    }, [tab, offSel, prodSel, catSel, brand, provSel, opzSel]);
    const riga: PayRiga | null = righeSet[0] ?? null;
    // nome e punti raccontano l'intero set (es. "GA base + MNP + Tied ×canone")
    const nomeRiga = righeSet.length > 1
        ? righeSet.map(r => r.nome.replace(/\s*×\s*canone\s*$/i, "").replace(/^\+\s*/, "")).join(" + ") + " ×canone"
        : riga?.nome || "";
    const puntiRiga = puntiPerRighe(righeSet);

    const scalaRiga = useMemo(() =>
        (tabEff && riga?.pista) ? tabEff.soglie.filter(s => s.pista === riga.pista).sort((a, b) => a.tier - b.tier) : [],
    [tabEff, riga]);
    const tierLive = riga?.pista && avz ? (avz.piste[riga.pista]?.tier ?? 0) : 0;
    const puntiPista = riga?.pista && avz ? (avz.piste[riga.pista]?.punti ?? 0) : 0;
    const puntiProj = proietta(puntiPista);
    let tierProj = 0;
    for (const sg of scalaRiga) if (puntiProj >= sg.soglia_da) tierProj = sg.tier;
    // preselezione sulla PROIEZIONE (a inizio mese, senza dati, vale la live)
    // pista appoggiata (S4 business): niente scala propria → la proiezione
    // non sa calcolare il tier, vale quello live (dalla soglia della madre)
    const tier = tierSel == null ? (proiezioneOn && avz && scalaRiga.length ? tierProj : tierLive) : tierSel;
    // modello W3: € complessivi del set — componenti a moltiplicatore ×canone
    // + gettoni flat (compenso contrattuale); brand classici = valore secco
    const canone = offSel?.canone_mensile == null ? null : Number(offSel.canone_mensile);
    const pay = righeSet.length ? payEuroAttivazione(righeSet, riga!.gettone ? 0 : tier, canone) : null;
    const payProssima = riga && !riga.gettone && tier < scalaRiga.length ? payEuroAttivazione(righeSet, tier + 1, canone) : null;
    // per la formula a video: moltiplicatori e flat separati
    const moltSum = righeSet.filter(r => r.moltiplicatore).reduce((s, r) => { const v = payPerRiga(r, r.gettone ? 0 : tier); return v == null ? s : s + v; }, 0);
    const flatSum = righeSet.filter(r => !r.moltiplicatore).reduce((s, r) => { const v = payPerRiga(r, r.gettone ? 0 : tier); return v == null ? s : s + v; }, 0);

    // scoperture: offerte del catalogo senza riga pay
    const scoperte = useMemo(() => {
        if (!tab) return [];
        const out: { tipo: string; cat: string; prod: string; off: string }[] = [];
        for (const o of offs) {
            const p = prods.find(x => x.id === o.prodotto_id); if (!p) continue;
            const c = cats.find(x => x.id === p.categoria_id); if (!c) continue;
            if (esclusaDalleGare({ categoria: c.nome, prodotto: p.nome, offerta: o.nome })) continue;   // escluse per regola, non scoperture
            // le opzioni si concedono SOLO al pick-one (revisore 25/08): date
            // anche alle componenti, un'offerta W3 senza base risulterebbe
            // «coperta» dai soli extra (Netflix, Pronto…) — scopertura nascosta
            const r = matchRigheAttivazione(tab.righe, { tipo_cliente: p.tipo_cliente, categoria: c.nome, prodotto: p.nome, offerta: o.nome }, brand);
            const coperta = r.length > 0
                || (tutteOpzioni != null && !!matchRigaTabellare(tab.righe, { tipo_cliente: p.tipo_cliente, categoria: c.nome, prodotto: p.nome, offerta: o.nome, opzioni: tutteOpzioni }, brand));
            if (!coperta) out.push({ tipo: p.tipo_cliente, cat: c.nome, prod: p.nome, off: o.nome });
        }
        return out;
    }, [tab, offs, prods, cats, brand, tutteOpzioni]);

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
                {/* VISTA AZIENDA (Luca 12/08): doppio click sul titolo, solo admin —
                    nessun bottone visibile. Il puntino discreto dice che è attiva. */}
                <h1 className="text-2xl font-bold text-white flex items-center gap-2 select-none"
                    onDoubleClick={() => { if (isAdmin) { setLatoAzienda(v => !v); setTierSel(null); setPdvSel(null); } }}>
                    <Calculator size={26} /> Calcolatore $$$
                    {latoAzienda && <span className="text-[11px] font-semibold text-amber-300/90 border border-amber-500/30 rounded-lg px-2 py-0.5">azienda</span>}
                </h1>
                <div className="flex items-center gap-3 flex-wrap">
                    {gl && (
                        <a href="/gare?brand=calendariogare" className="text-[12px] text-slate-400 hover:text-slate-200 transition-colors"
                            title="Si imposta in Gare → Calendario gare (giorni lavorativi, ora di scatto, visibilità proiezione)">
                            📅 lavorativi {gl.totali}{gl.override ? " ✎" : ""} · trascorsi {gl.trascorsi} · scatto h{gl.oraScatto}
                        </a>
                    )}
                    <input type="month" value={mese} onChange={e => { setMese(e.target.value); setTierSel(null); }}
                        className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
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

            {/* ①-bis LETTERA DI GARA (contesti T1/T2 di Vodafone e Fastweb) */}
            {brand && ctxOpzioni && (
                <div className="flex gap-2 flex-wrap items-center mb-5">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 mr-1">Lettera di gara</span>
                    {ctxOpzioni.map(o => (
                        <Pill key={o.key} on={ctxKey === o.key} onClick={() => setCtx(o.key)}>{o.label}</Pill>
                    ))}
                    <span className="text-[11px] text-slate-500">l&apos;attivazione si alloca col codice di inserimento</span>
                </div>
            )}

            {/* ①-ter PUNTO VENDITA (vista azienda WindTre): soglie del Target
                mensile del PDV, produzione allocata col codice di inserimento */}
            {latoAzienda && ctxKey === "windtre" && pdvList.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center mb-5">
                    <span className="text-[11px] uppercase tracking-wider text-amber-300/80 mr-1">Punto vendita</span>
                    <Pill on={pdvSel == null} onClick={() => { setPdvSel(null); setTierSel(null); }}>🌐 Rete</Pill>
                    {/* etichetta = negozio + CODICE GARA quando doppio (esito Luca
                        12/08: i cluster «Strada» venivano dal suo foglio Target ma
                        in etichetta confondevano — restano nel tooltip) */}
                    {pdvList.map(p => {
                        const doppio = pdvList.filter(x => x.negozio === p.negozio).length > 1;
                        return (
                            <Pill key={p.id} on={pdvSel === p.id} onClick={() => { setPdvSel(p.id); setTierSel(null); }}>
                                <span title={p.cluster_mobile ? `Cluster ${p.cluster_mobile} — colonna del foglio Target mensile W3` : undefined}>
                                    {p.negozio}{doppio && p.cod_gara ? ` · ${p.cod_gara}` : ""}
                                </span>
                            </Pill>
                        );
                    })}
                    {pdvRow && pdvList.filter(x => x.negozio === pdvRow.negozio).length > 1 && (
                        <span className="text-[11px] text-slate-500">i due codici {pdvRow.negozio} condividono lo stesso codice di inserimento: produzione unica, soglie diverse</span>
                    )}
                </div>
            )}

            {brand && (caricaCat || caricaTab) && (
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-4"><Loader2 className="animate-spin" size={16} /> Carico catalogo e tabellare…</div>
            )}

            {brand && !caricaTab && !tab && (
                <div className="glass-panel rounded-2xl p-4 mb-5 border border-amber-500/40 text-amber-200 text-sm flex items-center gap-2">
                    <TriangleAlert size={18} /> Nessun tabellare caricato per {(ctxKey && CONTESTI_LABEL[ctxKey]) || meta?.label} · {mese}: il pay non è calcolabile finché non si caricano piste, soglie e righe.
                </div>
            )}
            {brand && tab?.derivato && (
                <div className="glass-panel rounded-2xl px-4 py-2.5 mb-5 text-[12px] text-slate-400">
                    🧮 Tabellare ragazzi <b className="text-slate-200">derivato dal lato azienda</b> con la &quot;% ai ragazzi&quot; di ogni pista
                    ({tab.piste.map(p => {
                        // «✍️ manuale» = tutti gli importi della pista inseriti a mano
                        // (pay_ragazzi_tiers): la % di derivazione non si applica
                        const rrP = tab.righe.filter(r => r.pista === p.chiave && !r.gettone);
                        const man = rrP.length > 0 && rrP.every(r => Array.isArray(r.pay_ragazzi_tiers) && (r.pay_ragazzi_tiers?.length || 0) > 0);
                        return `${p.nome} ${man ? "✍️ manuale" : `${p.perc_ragazzi ?? 100}%`}`;
                    }).join(" · ")}) — si regola dalla pagina Gare dell&apos;operatore, lato azienda.
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
                                        <Pill key={p.id} on={prodId === p.id} onClick={() => { setProdId(p.id); setOffId(null); setTierSel(null); setProvSel(null); setOpzSel([]); }}>{p.nome}</Pill>
                                    ))}
                                </div>
                            </>}
                            {prodId && <>
                                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Offerta</div>
                                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
                                    {offsProd.map(o => {
                                        const on = offId === o.id;
                                        const r = tab && catSel && prodSel ? (matchRigheAttivazione(tab.righe, { tipo_cliente: prodSel.tipo_cliente, categoria: catSel.nome, prodotto: prodSel.nome, offerta: o.nome }, brand)[0]
                                            ?? (tutteOpzioni != null ? matchRigaTabellare(tab.righe, { tipo_cliente: prodSel.tipo_cliente, categoria: catSel.nome, prodotto: prodSel.nome, offerta: o.nome, opzioni: tutteOpzioni }, brand) : null)) : null;
                                        return (
                                            <button key={o.id} onClick={() => { setOffId(o.id); setTierSel(null); setOpzSel([]); }}
                                                className="rounded-xl px-3 py-3 text-sm font-semibold text-left border transition"
                                                style={{
                                                    background: on ? (meta?.color || "#6366f1") : "rgba(255,255,255,0.04)",
                                                    borderColor: on ? "transparent" : tab && !r ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.10)",
                                                    color: on ? "#fff" : "#cbd5e1",
                                                }}>
                                                {o.nome}
                                                {(esclusaProd || esclusaDalleGare({ categoria: catSel?.nome, prodotto: prodSel?.nome, offerta: o.nome })) && <span className="block text-[10px] font-normal mt-0.5 text-slate-400">➖ esclusa dalle gare</span>}
                                                {!esclusaProd && !esclusaDalleGare({ categoria: catSel?.nome, prodotto: prodSel?.nome, offerta: o.nome }) && tab && !r && <span className="block text-[10px] font-normal mt-0.5 text-amber-400">🚫 senza commissioning</span>}
                                            </button>
                                        );
                                    })}
                                    {!offsProd.length && <div className="text-slate-500 text-sm">Nessuna offerta per questo prodotto.</div>}
                                </div>
                                {/* PROVENIENZA (Luca 12/08): dove il tabellare la distingue
                                    (TIM +10 · Kena STAR) si può scegliere da che operatore
                                    arriva la MNP — Standard = nessuna maggiorazione */}
                                {provOpzioni.length > 0 && (
                                    <div className="mt-4">
                                        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Operatore di provenienza</div>
                                        <div className="flex gap-2 flex-wrap">
                                            <Pill on={provSel == null} onClick={() => { setProvSel(null); setTierSel(null); }}>Standard</Pill>
                                            {provOpzioni.map(p => (
                                                <Pill key={p.token} on={provSel === p.token} onClick={() => { setProvSel(p.token); setTierSel(null); }}>{p.label}</Pill>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* OPZIONI (ponte 25/08): PRIMA i gruppi a scelta
                                    obbligatoria del catalogo (Attivazione GA/GNP,
                                    Tecnologia FTTC/FTTH…, come Registra Vendita),
                                    poi le altre opzioni — catalogo ∪ righe pay
                                    ancorate a `opzione` (fasce S4, kit Protecta) */}
                                {offSel && (() => {
                                    const grpObb = [...new Set(opzCatalogo.filter(o => o.obb && o.gruppo).map(o => o.gruppo as string))];
                                    const libere = [
                                        ...opzCatalogo.filter(o => !(o.obb && o.gruppo)).map(o => o.nome),
                                        ...opzRilevanti.filter(o => !opzCatalogo.some(x => x.nome === o)),
                                    ];
                                    if (!grpObb.length && !libere.length) return null;
                                    return (
                                        <div className="mt-4 space-y-3">
                                            {grpObb.map(g => {
                                                const scelte = opzCatalogo.filter(o => o.gruppo === g);
                                                const fatta = scelte.some(o => opzSel.includes(o.nome));
                                                return (
                                                    <div key={g}>
                                                        <div className={`text-[11px] uppercase tracking-wider mb-2 font-bold ${fatta ? "text-emerald-400" : "text-amber-400"}`}>
                                                            ✱ <span className="capitalize">{g}</span> <span className="font-normal normal-case">{fatta ? "✓" : "— scegli una (il pay cambia)"}</span>
                                                        </div>
                                                        <div className="flex gap-2 flex-wrap">
                                                            {scelte.map(o => (
                                                                <Pill key={o.nome} on={opzSel.includes(o.nome)} onClick={() => togOpzCalc(o.nome)}>{o.nome}</Pill>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {libere.length > 0 && (
                                                <div>
                                                    <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Opzioni della vendita <span className="normal-case text-slate-500">— come in Registra Vendita: alcune cambiano il pay</span></div>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {libere.map(o => (
                                                            <Pill key={o} on={opzSel.includes(o)} onClick={() => togOpzCalc(o)}>{o}</Pill>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </>}
                        </div>
                    )}

                    {/* ③ RISULTATO */}
                    {offSel && (
                        <div className="glass-panel rounded-2xl p-6" style={{ borderLeft: `4px solid ${meta?.color || "#6366f1"}` }}>
                            {esclusaSel ? (
                                <div className="text-slate-300 text-sm">
                                    ➖ Questa vendita è <b>esclusa dalle gare</b> per regola aziendale (sostituzioni SIM di tutti gli operatori ed Easy Control): né commissioning né punti.
                                </div>
                            ) : !tab ? (
                                <div className="text-amber-300 text-sm">Tabellare non caricato per questo mese: nessun pay calcolabile.</div>
                            ) : !riga ? (
                                // fasce S4 & co.: il pay c'è ma dipende dalle opzioni —
                                // senza scelta la guida, non il falso «senza commissioning»
                                opzRilevanti.length > 0 && !opzSel.length ? (
                                    <div className="text-amber-300 font-semibold flex items-center gap-2">
                                        <TriangleAlert size={20} /> Scegli le «Opzioni della vendita» qui sopra (es. la fascia di consumo): il pay di questa offerta dipende da quelle.
                                    </div>
                                ) : (
                                <div className="text-amber-300 font-semibold flex items-center gap-2">
                                    <TriangleAlert size={20} /> Questa offerta non ha una riga di commissioning: NON genera pay.
                                    <span className="text-slate-400 text-xs font-normal">Va aggiunta la riga al tabellare (regola del catalogo).</span>
                                </div>
                                )
                            ) : (
                                <>
                                    <div className="flex items-start justify-between flex-wrap gap-4">
                                        <div>
                                            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">{nomeRiga}</div>
                                            <div className="text-5xl font-black text-white leading-none">{euro(pay)}</div>
                                            <div className="text-slate-400 text-sm mt-2">
                                                {riga.gettone
                                                    ? "💰 Gettone unico — paga sempre, senza soglia"
                                                    : tier <= 0
                                                        ? '"Di cui base" — sotto la 1ª soglia'
                                                        : `alla Soglia ${tier} · retroattivo dal 1° pezzo`}
                                                {riga.moltiplicatore && (canone != null
                                                    ? ` · ×${Math.round(moltSum * 100) / 100} sul canone di ${euro(canone)}${flatSum ? ` + ${euro(Math.round(flatSum * 100) / 100)} contrattuale` : ""}`
                                                    : " · ⚠️ manca il canone mensile a catalogo")}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {riga.pista && <div className="text-slate-300 text-sm font-semibold">{tab.piste.find(p => p.chiave === riga.pista)?.nome || riga.pista}</div>}
                                            {puntiRiga > 0 && <div className="text-slate-400 text-sm mt-1">vale <b className="text-white">{puntiRiga}</b> in soglia</div>}
                                        </div>
                                    </div>
                                    {/* RICORRENTE (S4 25/08): informativo, fuori dal one-shot */}
                                    {(() => { const ric = righeSet.reduce((s, r) => s + (r.ricorrente ?? 0), 0); return ric > 0 ? (
                                        <div className="text-sky-300/90 text-sm mt-3">🔁 In più <b>{euro(ric)}</b> al mese di ricorrente dall&apos;8° mese dal contratto (≈ 6° di fornitura)</div>
                                    ) : null; })()}
                                    {!riga.gettone && scalaRiga.length > 0 && (
                                        <div className="mt-5">
                                            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
                                                {proiezioneOn ? "Soglia — preselezionata sulla PROIEZIONE a fine mese" : `Soglia — sul dato attuale (proiezione visibile dal giorno ${gl?.proiezioneDal ?? 1})`}
                                                {avz && riga.pista ? (proiezioneOn ? ` (S${tierProj || "0"} · ${puntiProj} punti proiettati) — oggi S${tierLive || "0"} · ${puntiPista} punti` : ` (S${tierLive || "0"} · ${puntiPista} punti)`) : ""}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                {/* la pillola Base esiste solo se un pay "di cui
                                                    base" esiste (S4 non ce l'ha — Luca 25/08) */}
                                                {righeSet.some(r => r.pay_base != null) && <Pill on={tier === 0} onClick={() => setTierSel(0)}>Base</Pill>}
                                                {scalaRiga.map(s => (
                                                    <Pill key={s.tier} on={tier === s.tier} onClick={() => setTierSel(s.tier)}>
                                                        S{s.tier} <span className="opacity-70 font-normal">({s.soglia_da}{s.soglia_a ? `–${s.soglia_a}` : "+"})</span>
                                                    </Pill>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {payProssima != null && pay != null && payProssima !== pay && (
                                        <div className="text-emerald-300/90 text-sm mt-4">
                                            🎯 Alla S{tier + 1} questa attivazione varrebbe <b>{euro(payProssima)}</b> ({payProssima > pay ? "+" : ""}{euro(Math.round((payProssima - pay) * 100) / 100)})
                                        </div>
                                    )}
                                    {/* VINCOLI W3 (lettera agosto): gate 4ª soglia e malus −30% */}
                                    {riga.pista && avz?.piste[riga.pista]?.gate && (
                                        <div className="text-amber-300 text-xs mt-3">⛔ {avz.piste[riga.pista].gate}</div>
                                    )}
                                    {avz?.malus30Mobile && riga.pista === "mobile" && (
                                        <div className="text-rose-300/90 text-xs mt-2">
                                            ⚠️ Premio della gara mobile −30% se il mese chiude senza la 1ª soglia del fisso e 6 attivazioni P.IVA mobile
                                            (ora: fisso S{avz.piste["fisso"]?.tier ?? 0} · P.IVA mobile {avz.pivaMobile}).
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
                            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Avanzamento {pdvRow ? `${pdvRow.negozio}` : "rete"} · {mese}</div>
                            {ctxKey && CONTESTI_LABEL[ctxKey] && <div className="text-[11px] text-slate-500 mb-3">{CONTESTI_LABEL[ctxKey]}</div>}
                            {!avz ? <div className="text-slate-500 text-sm">Calcolo…</div> : tab.piste.map(p => {
                                const a = avz.piste[p.chiave]; if (!a) return null;
                                const target = a.prossima?.soglia_da ?? a.soglia?.soglia_da ?? 0;
                                const perc = target > 0 ? Math.min(100, Math.round(a.punti / target * 100)) : 100;
                                const scalaP = (tabEff || tab).soglie.filter(sg => sg.pista === p.chiave).sort((x, y) => x.tier - y.tier);
                                const projP = proietta(a.punti);
                                let tierP = 0;
                                for (const sg of scalaP) if (projP >= sg.soglia_da) tierP = sg.tier;
                                return (
                                    <div key={p.chiave} className="mb-4 last:mb-0">
                                        {/* la PROIEZIONE è il dato principale (Luca 11/08); l'attuale sotto */}
                                        <div className="flex justify-between text-sm mb-0.5">
                                            <span className="text-slate-200 font-semibold">{p.nome}</span>
                                            {proiezioneOn ? (
                                                <span className="text-white font-bold">📈 {projP} <span className="text-indigo-300">{tierP > 0 ? `S${tierP}` : "sotto soglia"}</span></span>
                                            ) : (
                                                <span className="text-slate-400">{a.punti} punti · {a.tier > 0 ? `S${a.tier}` : "sotto soglia"}</span>
                                            )}
                                        </div>
                                        {proiezioneOn && (
                                            <div className="text-[11px] text-slate-500 mb-1">oggi: {a.punti} punti · {a.tier > 0 ? `S${a.tier}` : "sotto soglia"}</div>
                                        )}
                                        {scalaP.length > 0 && <div className="text-[11px] text-slate-500 mb-1">soglie: {scalaP.map(sg => sg.soglia_da).join(" · ")}</div>}
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
                            {nonAlloc > 0 && (
                                <div className="text-[11px] text-amber-400/80 mt-1">
                                    {nonAlloc} vendite VF/FW con codice non riconducibile a una lettera
                                </div>
                            )}
                            {escluseVf > 0 && (
                                <div className="text-[11px] text-slate-500 mt-1">
                                    ➖ {escluseVf} MNP/OLO da Vodafone escluse (regola lettera: né target né compenso)
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
