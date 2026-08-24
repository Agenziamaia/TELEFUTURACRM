// @ts-nocheck
"use client";

// HOME A WIDGET SINGOLI (Luca 17/08). Ogni widget è indipendente: si
// aggiunge, si toglie, si trascina in ordine sparso e si ridimensiona
// (1 blocco · 2 blocchi · mezza pagina), come i widget di un telefono.
// L'ordine e le taglie sono salvati per utente in app_users.dashboard_layout
// come ["id@taglia", ...]; i vecchi layout a blocchi vengono spacchettati.
//
// NUMERI: produzione del NEGOZIO CHE REGISTRA (colonna negozio) — mai il
// codice di inserimento (quello è il caricamento azienda, vive in Gare).
// Store manager → tutto il punto vendita; consulente → solo il suo.

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { roleLabel, seesWholeStore } from "@/lib/roles";
import { useVisibleStores } from "@/lib/visibleStores";
import { comunicazionePerMe, brandDiUtente, negoziAssegnati } from "@/lib/comunicazioniTarget";
import { SelectMulti } from "@/components/SelectPersona";
import { caricaTutte } from "@/lib/fetchTutte";
import { giorniLavorativiMese, caricaContrattiMese, caricaTabellareAzienda, caricaTabellare } from "@/lib/commissioning";
import { cn } from "@/utils";
import {
    Loader2, LayoutGrid, Check, GripVertical, Plus, X, ChevronLeft,
    ChevronRight, RotateCcw, Store as StoreIcon, Users,
} from "lucide-react";
import {
    renderWidget, infoWidget, widgetsDisponibili, risolviLayout, layoutDefault,
    encodeLayout, SIZE_LABEL, isCtr, isExt, validaProduzione, giornoDi,
} from "./_widgets";

const norm = (s) => (s || "").trim().toLowerCase();
const sameStore = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const CLOSED_TASK = ["fatta", "abbandonata"];
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const SPAN = { 1: "sm:col-span-1", 2: "sm:col-span-2", 4: "sm:col-span-2 xl:col-span-4" };

export default function Dashboard() {
    const { user } = useAuth();
    const { seesAll, stores: myStores, loaded: visLoaded } = useVisibleStores();
    const visKey = myStores.join("|");

    const [all, setAll] = useState([]);
    const [comms, setComms] = useState([]);
    const [targets, setTargets] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [margCats, setMargCats] = useState([]);
    const [margItems, setMargItems] = useState([]);
    const [gl, setGl] = useState(null);
    const [savedLayout, setSavedLayout] = useState(undefined);
    const [loading, setLoading] = useState(true);

    // periodo: "month" (mese corrente) · "custom" (mese scelto) · "range"
    // (dal–al libero, Luca 19/08) · "all" (tutto lo storico)
    const [period, setPeriod] = useState("month");
    const [filtro, setFiltro] = useState(null);
    const [range, setRange] = useState(null);            // { da, a } ISO
    const [filtroOpen, setFiltroOpen] = useState(false);
    const [tmpM, setTmpM] = useState(new Date().getMonth());
    const [tmpY, setTmpY] = useState(new Date().getFullYear());
    const [tmpDa, setTmpDa] = useState("");
    const [tmpA, setTmpA] = useState("");
    const ANNI = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
    const fmtGiorno = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";

    // FILTRO NEGOZI (Luca 19/08): chi gestisce più punti vendita (e l'admin)
    // può guardare solo alcuni negozi — selezione salvata per utente
    const [negoziSel, setNegoziSel] = useState([]);
    const [elencoNegozi, setElencoNegozi] = useState([]);

    const [layout, setLayout] = useState([]);
    const layoutPronto = useRef(false);
    const [editMode, setEditMode] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [dragKey, setDragKey] = useState(null);

    const [negoziAss, setNegoziAss] = useState([]);
    const [brandsNeg, setBrandsNeg] = useState([]);
    const [motore, setMotore] = useState(null);
    const motoreYm = useRef(null);

    // ── caricamento dati ────────────────────────────────────────────────────
    useEffect(() => {
        if (!user?.id || !visLoaded) return;
        let alive = true;
        (async () => {
            setLoading(true);
            const caricaComms = async () => {
                const est = await supabase.from("comunicazioni").select("id, title, type, content, target_roles, target_stores, target_users, target_brands, created_by, created_at, date_display").order("created_at", { ascending: false }).limit(30);
                if (!est.error) return est;
                return supabase.from("comunicazioni").select("id, title, type, content, target_roles, created_at, date_display").order("created_at", { ascending: false }).limit(30);
            };
            const oggi = new Date();
            const meseISO = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-01`;
            const [{ data: cs }, { data: cm }, { data: tg }, { data: tk }, { data: me }, { data: mc }, { data: mi }, glv, negs] = await Promise.all([
                // caricaTutte supera il tetto server 1000; qty è dettagli->>qty
                // (pezzi marginalità) senza scaricare l'intero jsonb dettagli
                caricaTutte((from, to) =>
                    supabase.from("contracts").select("id, brand, categoria, prodotto, stato, negozio, venditore, client_id, data, data_registrazione, nascosta_gestione, qty:dettagli->>qty, prezzo:dettagli->>price").order("data_registrazione", { ascending: false }).order("id").range(from, to)),
                caricaComms(),
                supabase.from("dashboard_targets").select("*"),
                supabase.from("calendar_tasks").select("id, date, status").or(`assigned_user_id.eq.${user.id},created_by_user_id.eq.${user.id}`).limit(500),
                supabase.from("app_users").select("dashboard_layout").eq("id", user.id).maybeSingle(),
                supabase.from("marg_categories").select("id, name, icon, active"),
                supabase.from("marg_items").select("name, category_id"),
                giorniLavorativiMese(meseISO).catch(() => null),
                supabase.from("stores").select("name").order("name").then(({ data }) => data || []),
            ]);
            if (!alive) return;
            setAll(cs || []); setComms(cm || []); setTargets(tg || []); setTasks(tk || []);
            setMargCats((mc || []).filter((c) => c.active !== false)); setMargItems(mi || []);
            setGl(glv);
            setElencoNegozi((negs || []).map((x) => x.name).filter(Boolean));
            try { const sel = JSON.parse(localStorage.getItem("tf_home_negozi_" + user.id) || "[]"); if (Array.isArray(sel)) setNegoziSel(sel); } catch { /* storage negato */ }
            setSavedLayout(Array.isArray(me?.dashboard_layout) ? me.dashboard_layout : []);
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [user?.id, visLoaded, visKey, seesAll]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { negoziAssegnati(user?.id).then(setNegoziAss); }, [user?.id]);
    useEffect(() => { brandDiUtente(user?.id).then(setBrandsNeg); }, [user?.id]);

    // ── scala di visibilità (come il resto del CRM) ─────────────────────────
    const whole = seesWholeStore(user?.role);
    const level = seesAll ? "global" : whole ? "store" : "own";
    const multiStore = seesAll || myStores.length > 1;

    // ymd LOCALE (Roma), mai toISOString: dopo mezzanotte l'UTC è ancora ieri
    // e il chip «oggi» mostrava il giorno sbagliato (visto 20/08 alle 00:38)
    const _oggi = new Date();
    const oggiISO = `${_oggi.getFullYear()}-${String(_oggi.getMonth() + 1).padStart(2, "0")}-${String(_oggi.getDate()).padStart(2, "0")}`;
    const ymCorrente = oggiISO.slice(0, 7);
    const ymShown = period === "month" ? ymCorrente : period === "custom" && filtro ? `${filtro.y}-${String(filtro.m + 1).padStart(2, "0")}` : null;
    const rangeShown = period === "range" && range ? range : null;

    const byPeriod = (list) => {
        if (period === "all") return list;
        if (rangeShown) return list.filter((c) => { const g = giornoDi(c); return g >= rangeShown.da && g <= rangeShown.a; });
        const ym = ymShown || ymCorrente;
        return list.filter((c) => giornoDi(c).startsWith(ym));
    };

    // mesi toccati dal periodo (i punti di gara sono mensili: per un range che
    // scavalca i mesi ogni mese si calcola col SUO tabellare e si somma)
    const mesiShown = useMemo(() => {
        if (rangeShown) {
            const out = [];
            const [y0, m0] = rangeShown.da.slice(0, 7).split("-").map(Number);
            const fine = rangeShown.a.slice(0, 7);
            const d = new Date(y0, m0 - 1, 1, 12);
            while (out.length < 12) {
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                out.push(ym);
                if (ym === fine) break;
                d.setMonth(d.getMonth() + 1);
            }
            return out;
        }
        return [ymShown || ymCorrente];
    }, [rangeShown?.da, rangeShown?.a, ymShown, ymCorrente]); // eslint-disable-line react-hooks/exhaustive-deps

    // negozi VISIBILI = selezione del filtro (se attiva) — null = tutta la rete
    const puoFiltrareNegozi = seesAll || myStores.length > 1;
    const negoziVisibili = useMemo(() => {
        if (!puoFiltrareNegozi || !negoziSel.length) return level === "global" ? null : myStores;
        const sel = level === "global" ? negoziSel : negoziSel.filter((s) => myStores.some((m) => sameStore(m, s)));
        return sel.length ? sel : (level === "global" ? null : myStores);
    }, [negoziSel, level, visKey, puoFiltrareNegozi]); // eslint-disable-line react-hooks/exhaustive-deps
    const negoziKey = (negoziVisibili || []).join("|");

    const scoped = useMemo(() => {
        if (level === "own") return all.filter((c) => norm(c.venditore) === norm(user?.name));
        if (negoziVisibili === null) return all;
        return all.filter((c) => negoziVisibili.some((s) => sameStore(c.negozio, s)));
    }, [all, level, negoziKey, user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    const mine = useMemo(() => byPeriod(scoped), [scoped, period, filtro]);

    const storesRef = myStores.length ? myStores : (user?.negozio ? [user.negozio] : []);
    const storeRows = useMemo(() => byPeriod(all.filter((c) => storesRef.some((s) => sameStore(c.negozio, s)))), [all, visKey, user?.negozio, period, filtro]);

    // brand osservati nella produzione (ultimi 60 giorni) → widget proposti
    const brandsOsservati = useMemo(() => {
        const da = daysAgoISO(60);
        const m = {};
        scoped.forEach((c) => { if (isCtr(c) && validaProduzione(c) && giornoDi(c) >= da && c.brand) m[c.brand] = (m[c.brand] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([b]) => b);
    }, [scoped]);
    const brandsGallery = useMemo(() => {
        const m = {};
        scoped.forEach((c) => { if (isCtr(c) && validaProduzione(c) && c.brand) m[c.brand] = (m[c.brand] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([b]) => b);
    }, [scoped]);

    // ── Motore gare: vendite W3/VF/FW + tabellari dei mesi del periodo ──────
    // I punti dei widget brand usano le STESSE funzioni del Calcolatore
    // (caricaContrattiMese + matchRigheAttivazione), ma aggregati sul negozio
    // che registra. Un pacchetto per OGNI mese del periodo: le gare sono
    // mensili, ogni mese matcha col suo tabellare e i widget sommano.
    useEffect(() => {
        if (loading) return;
        const chiave = mesiShown.join("|");
        if (motoreYm.current === chiave) return;
        motoreYm.current = chiave;
        setMotore(null);
        let alive = true;
        (async () => {
            try {
                const packs = await Promise.all(mesiShown.map(async (ym) => {
                    const iso = `${ym}-01`;
                    const [rw3, rvf, rfw, rsky, tw3, tvf, tsky] = await Promise.all([
                        caricaContrattiMese("WindTre", iso),
                        caricaContrattiMese("Vodafone", iso),
                        caricaContrattiMese("Fastweb", iso),
                        caricaContrattiMese("Sky", iso),
                        caricaTabellareAzienda("windtre", iso).catch(() => null),
                        caricaTabellareAzienda("vodafone", iso).catch(() => null),
                        // Sky: il tabellare AZIENDA non esiste ancora — i punti
                        // vivono nella pista "sky" lato ragazzi (gara interna a
                        // punti): fonte dichiarata finché non nasce l'azienda
                        caricaTabellare("sky", iso).catch(() => null),
                    ]);
                    return { ym, w3: rw3 || [], vf: rvf || [], fw: rfw || [], sky: rsky || [], tabW3: tw3, tabVF: tvf, tabSky: tsky };
                }));
                if (alive) setMotore({ chiave, packs });
            } catch { if (alive) setMotore({ chiave, packs: [] }); }
        })();
        return () => { alive = false; };
    }, [loading, mesiShown]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── numeri dei widget storici (invariati) ───────────────────────────────
    const groupBy = (list, key) => {
        const m = {};
        list.forEach((c) => { const k = (c[key] || "—").toString(); m[k] = (m[k] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const byBrand = useMemo(() => groupBy(mine, "brand"), [mine]);
    const byStato = useMemo(() => groupBy(mine, "stato"), [mine]);
    const terzo = useMemo(() => {
        if (level === "own") return null;
        if (multiStore) return { title: level === "global" ? "Top negozi rete" : "Top negozi area", icon: StoreIcon, rows: groupBy(mine, "negozio").slice(0, 12), color: "var(--tf-a855f7)" };
        return { title: "Top venditori negozio", icon: Users, rows: groupBy(mine, "venditore").slice(0, 12), color: "var(--tf-38bdf8)" };
    }, [mine, level, multiStore]);
    const attivi = mine.filter((c) => /attiv/i.test(c.stato || "")).length;
    const lavorazione = mine.filter((c) => /lavorazione|nuovo/i.test(c.stato || "")).length;
    const clienti = new Set(mine.map((c) => c.client_id).filter(Boolean)).size;
    const sevenAgo = daysAgoISO(7);
    const ferme = useMemo(() => scoped.filter((c) => /lavorazione|nuovo/i.test(c.stato || "") && (c.data_registrazione || "9999") < sevenAgo).length, [scoped]);
    const impegni = useMemo(() => tasks.filter((t) => (t.date || "") && (t.date || "") <= oggiISO && !CLOSED_TASK.includes(norm(t.status))).length, [tasks]);
    const targetVal = useMemo(() => {
        const find = (fn) => targets.find(fn)?.valore || 0;
        if (level === "own") return find((x) => x.tipo === "venditore" && norm(x.riferimento) === norm(user?.name));
        if (level === "store") return find((x) => x.tipo === "negozio" && myStores.some((s) => sameStore(x.riferimento, s)));
        return find((x) => x.tipo === "rete");
    }, [targets, level, user?.name, visKey]);
    const classifica = useMemo(() => {
        const periodAll = byPeriod(all);
        const m = {};
        periodAll.forEach((c) => {
            const v = (c.venditore || "").trim();
            if (!v || v === "—") return;
            if (!m[v]) m[v] = { nome: v, n: 0, negozio: c.negozio || "" };
            m[v].n++;
            if (!m[v].negozio && c.negozio) m[v].negozio = c.negozio;
        });
        return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 10).map((x, i) => ({ ...x, rank: i + 1 }));
    }, [all, period, filtro]);

    const commsVisibili = useMemo(() => comms.filter((c) =>
        comunicazionePerMe(c, { userId: user?.id, role: user?.role, negozio: user?.negozio, negozi: negoziAss, brandsNegozio: brandsNeg })
        || (c.created_by && c.created_by === user?.id)
    ).slice(0, 8), [comms, user?.id, user?.role, user?.negozio, negoziAss, brandsNeg]);

    // marginalità: mappa prodotto→categoria (e icone) dal pannello Marginalità
    const margMap = useMemo(() => {
        const catName = new Map(margCats.map((c) => [c.id, c.name]));
        const m = new Map();
        margItems.forEach((it) => { const cat = catName.get(it.category_id); if (it.name && cat) m.set(norm(it.name), { cat }); });
        return m;
    }, [margCats, margItems]);
    const margIcone = useMemo(() => new Map(margCats.map((c) => [c.name, c.icon || "🧩"])), [margCats]);

    // oggi conta già nei numeri di gara? (ora di scatto + giorni lavorativi)
    const oggiContato = useMemo(() => {
        if (!gl) return false;
        const now = new Date();
        if (now.getHours() < (gl.oraScatto ?? 19)) return false;
        if (now.getDay() === 0) return false;
        if ((gl.festivi || []).includes(oggiISO)) return false;
        if ((gl.congelati || []).includes(now.getDate())) return false;
        return true;
    }, [gl, oggiISO]);

    const ymScorso = useMemo(() => {
        const ym = ymShown || ymCorrente;
        const [y, m] = ym.split("-").map(Number);
        const d = new Date(y, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }, [ymShown, ymCorrente]);

    const inNegoziVisibili = (neg) => negoziVisibili === null ? true : negoziVisibili.some((s) => sameStore(neg, s));

    const periodoLabel =
        period === "month" ? "questo mese" :
        period === "custom" && filtro ? `a ${MESI[filtro.m].toLowerCase()} ${filtro.y}` :
        rangeShown ? `dal ${fmtGiorno(rangeShown.da)} al ${fmtGiorno(rangeShown.a)}` : "in totale";
    const scopeLabel = level === "own" ? "I tuoi numeri"
        : negoziVisibili === null ? "Tutta la rete"
        : negoziVisibili.length <= 2 ? negoziVisibili.join(", ")
        : negoziVisibili.length + " negozi selezionati";

    const allPeriod = useMemo(() => byPeriod(all), [all, period, filtro]);

    // identità STABILI per i widget a motore: i loro useMemo interni si
    // rifanno solo quando cambiano i dati, non a ogni re-render della pagina
    // (senza, i match del motore giravano a ogni render e saturavano il main
    // thread — incidente 17/08). Le righe dei pacchetti sono già ritagliate
    // sul periodo selezionato (range dal–al compreso).
    const taglia = (rows) => rangeShown ? rows.filter((c) => { const g = giornoDi(c); return g >= rangeShown.da && g <= rangeShown.a; }) : rows;
    const w3Ctx = useMemo(() => motore ? {
        ym: motore.packs.length === 1 ? motore.packs[0].ym : null,
        packs: motore.packs.map((p) => ({ ym: p.ym, rows: taglia(p.w3), tab: p.tabW3 })),
    } : null, [motore, rangeShown?.da, rangeShown?.a]); // eslint-disable-line react-hooks/exhaustive-deps
    const vfCtx = useMemo(() => motore ? {
        ym: motore.packs.length === 1 ? motore.packs[0].ym : null,
        packs: motore.packs.map((p) => ({ ym: p.ym, rows: taglia(p.vf), rowsFw: taglia(p.fw), tab: p.tabVF })),
    } : null, [motore, rangeShown?.da, rangeShown?.a]); // eslint-disable-line react-hooks/exhaustive-deps
    const skyCtx = useMemo(() => motore ? {
        ym: motore.packs.length === 1 ? motore.packs[0].ym : null,
        packs: motore.packs.map((p) => ({ ym: p.ym, rows: taglia(p.sky || []), tab: p.tabSky })),
    } : null, [motore, rangeShown?.da, rangeShown?.a]); // eslint-disable-line react-hooks/exhaustive-deps

    const ctx = {
        user, level, seesAll, myStores, multiStore, scopeLabel, periodoLabel,
        oggiISO, ymShown, rangeShown,
        periodoEMeseCorrente: !rangeShown && period !== "all" && (ymShown || ymCorrente) === ymCorrente,
        // il chip "oggi" vive anche su un range che include oggi
        includeOggi: (!rangeShown && period !== "all" && (ymShown || ymCorrente) === ymCorrente) || (!!rangeShown && rangeShown.da <= oggiISO && oggiISO <= rangeShown.a),
        oggiContato, gl, visKey, negoziKey,
        // scope condiviso dei widget: consulente = le sue vendite; negozio e
        // rete = i negozi VISIBILI (filtro negozi rispettato anche dall'admin)
        scopeVendita: (c) => level === "own" ? norm(c.venditore) === norm(user?.name) : inNegoziVisibili(c.negozio),
        w3: w3Ctx,
        vf: vfCtx,
        sky: skyCtx,
        allPeriod,
        aggiornaWidgetId: (vecchio, nuovo) => {
            if (!nuovo || vecchio === nuovo) return;
            salvaLayout(layout.map((w) => w.k === vecchio ? { ...w, k: nuovo } : w));
        },
        meseScorsoYm: ymScorso, meseScorsoLabel: MESI[Number(ymScorso.slice(5, 7)) - 1].slice(0, 3).toLowerCase(),
        inMyStores: (neg) => storesRef.some((s) => sameStore(neg, s)),
        mine, scoped, storeRows,
        attivi, lavorazione, clienti, ferme, impegni,
        byBrand, byStato, terzo, classifica, commsVisibili,
        targetVal,
        targetTitle: level === "own" ? "Il tuo obiettivo" : level === "store" ? (multiStore ? "Target area" : "Target negozio") : "Target rete",
        targetSub: level === "own" ? "Contratti personali" : level === "store" ? "Contratti del negozio" : "Contratti della rete",
        margMap, margIcone, brandsOsservati, brandsGallery,
    };

    // ── risoluzione layout (una volta, a dati pronti) ───────────────────────
    useEffect(() => {
        if (loading || savedLayout === undefined || layoutPronto.current) return;
        layoutPronto.current = true;
        setLayout(risolviLayout(savedLayout, ctx));
    }, [loading, savedLayout]); // eslint-disable-line react-hooks/exhaustive-deps

    const salvaLayout = async (next) => {
        setLayout(next);
        try { await supabase.from("app_users").update({ dashboard_layout: encodeLayout(next) }).eq("id", user.id); } catch { /* offline: resta locale */ }
    };
    const muovi = (k, dir) => {
        const i = layout.findIndex((w) => w.k === k);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= layout.length) return;
        const next = [...layout];[next[i], next[j]] = [next[j], next[i]];
        salvaLayout(next);
    };
    const ridimensiona = (k, s) => salvaLayout(layout.map((w) => w.k === k ? { ...w, s } : w));
    const rimuovi = (k) => salvaLayout(layout.filter((w) => w.k !== k));
    const aggiungi = (id) => {
        const info = infoWidget(id, ctx);
        if (!info || layout.some((w) => w.k === id)) return;
        salvaLayout([{ k: id, s: info.def }, ...layout]);
    };
    const onDrop = (targetKey) => {
        if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
        const next = [...layout];
        const from = next.findIndex((w) => w.k === dragKey);
        const to = next.findIndex((w) => w.k === targetKey);
        if (from < 0 || to < 0) { setDragKey(null); return; }
        next.splice(to, 0, next.splice(from, 1)[0]);
        salvaLayout(next); setDragKey(null);
    };

    if (!user) return null;

    const disponibili = widgetsDisponibili(ctx, layout.map((w) => w.k));
    const GRUPPI = [
        ["performance", "🏁 Performance"], ["confronto", "⚔️ Confronto"],
        ["statistiche", "📊 Statistiche"], ["comunicazione", "📣 Comunicazione"],
        ["squadra", "👥 Squadra"], ["strumenti", "🧰 Strumenti"],
    ];

    return (
        <div className="space-y-5">
            {/* HEADER */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-black text-white">Ciao, {(user.name || "").split(" ")[0] || "—"}</h1>
                    <p className="text-sm text-slate-500">{roleLabel(user.role)}{seesAll ? " · tutti i negozi" : myStores.length ? ` · ${myStores.join(", ")}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setEditMode((v) => !v); setAddOpen(false); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${editMode ? "bg-emerald-500 text-white border-emerald-500" : "bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10"}`}>
                        {editMode ? <><Check className="w-3.5 h-3.5" /> Fatto</> : <><LayoutGrid className="w-3.5 h-3.5" /> Modifica</>}
                    </button>
                    <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10 relative">
                        <button onClick={() => { setPeriod("month"); setFiltroOpen(false); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${period === "month" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}>Questo mese</button>
                        <button onClick={() => { if (filtro) { setTmpM(filtro.m); setTmpY(filtro.y); } if (range) { setTmpDa(range.da); setTmpA(range.a); } setFiltroOpen((o) => !o); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 ${period === "custom" || period === "all" || period === "range" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}>
                            {period === "custom" && filtro ? `${MESI[filtro.m]} ${filtro.y}` : period === "range" && range ? `${fmtGiorno(range.da)} – ${fmtGiorno(range.a)}` : period === "all" ? "Tutto" : "Filtro"} <span className="text-[9px]">▾</span>
                        </button>
                        {filtroOpen && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setFiltroOpen(false)} />
                                <div className="absolute right-0 top-full mt-2 z-30 w-64 glass-card p-3 space-y-2.5 border-white/10 shadow-2xl">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Scegli mese e anno</div>
                                    <div className="flex gap-2">
                                        <select value={tmpM} onChange={(e) => setTmpM(parseInt(e.target.value))} className="glass-input !h-9 text-xs flex-1">
                                            {MESI.map((mm, i) => <option key={i} value={i}>{mm}</option>)}
                                        </select>
                                        <select value={tmpY} onChange={(e) => setTmpY(parseInt(e.target.value))} className="glass-input !h-9 text-xs w-[84px]">
                                            {ANNI.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={() => { setFiltro({ y: tmpY, m: tmpM }); setPeriod("custom"); setFiltroOpen(false); }}
                                        className="w-full py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold">Applica</button>
                                    <div className="pt-1.5 border-t border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-500">oppure un periodo</div>
                                    {/* le date native hanno larghezza minima incomprimibile:
                                        su UNA riga sfondavano il pannello → due righe (Luca 19/08) */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 w-7 shrink-0">Dal</span>
                                        <input type="date" value={tmpDa} onChange={(e) => setTmpDa(e.target.value)} className="glass-input !h-9 text-xs flex-1 min-w-0" aria-label="Dal" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 w-7 shrink-0">Al</span>
                                        <input type="date" value={tmpA} onChange={(e) => setTmpA(e.target.value)} className="glass-input !h-9 text-xs flex-1 min-w-0" aria-label="Al" />
                                    </div>
                                    <button disabled={!tmpDa || !tmpA}
                                        onClick={() => { const [da, a] = tmpDa <= tmpA ? [tmpDa, tmpA] : [tmpA, tmpDa]; setRange({ da, a }); setPeriod("range"); setFiltroOpen(false); }}
                                        className="w-full py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold">Applica periodo</button>
                                    <button onClick={() => { setPeriod("all"); setFiltro(null); setRange(null); setFiltroOpen(false); }}
                                        className="w-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors">oppure mostra tutto lo storico</button>
                                    {puoFiltrareNegozi && (
                                        <>
                                            <div className="pt-1.5 border-t border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-500">Negozi{negoziSel.length ? ` (${negoziSel.length})` : ""}</div>
                                            <SelectMulti
                                                values={negoziSel}
                                                onChange={(v) => { setNegoziSel(v); try { localStorage.setItem("tf_home_negozi_" + user.id, JSON.stringify(v)); } catch { /* storage negato */ } }}
                                                opzioni={seesAll ? elencoNegozi : myStores}
                                                placeholder="Tutti — scrivi per scegliere" maxVoci={30} className="!h-9 text-xs" />
                                            {negoziSel.length > 0 && (
                                                <button onClick={() => { setNegoziSel([]); try { localStorage.setItem("tf_home_negozi_" + user.id, "[]"); } catch { /* ok */ } }}
                                                    className="w-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors">mostra tutti i negozi</button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {editMode && (
                <div className="glass-card px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs text-indigo-200 bg-indigo-500/10 border-indigo-500/25">
                    <span className="flex items-center gap-2"><GripVertical className="w-4 h-4" /> Trascina i widget, cambia taglia (1 · 2 · ½ pagina) o toglili. Tutto salvato solo per te.</span>
                    <span className="flex items-center gap-2 ml-auto">
                        <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white font-bold hover:bg-indigo-600"><Plus className="w-3.5 h-3.5" /> Aggiungi widget</button>
                        <button onClick={() => salvaLayout(layoutDefault(ctx))} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 text-slate-300 font-semibold hover:bg-white/20" title="Torna al layout consigliato"><RotateCcw className="w-3.5 h-3.5" /> Ripristina</button>
                    </span>
                </div>
            )}

            {loading ? (
                <div className="glass-card p-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento dati…</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" style={{ gridAutoFlow: "row dense" }}>
                    {layout.map(({ k, s }) => {
                        const info = infoWidget(k, ctx);
                        if (!info) return null;
                        const contenuto = renderWidget(k, ctx, s);
                        if (!contenuto) return null;
                        return (
                            <div key={k} className={cn(SPAN[s] || SPAN[1], editMode && "relative")}
                                draggable={editMode}
                                onDragStart={() => setDragKey(k)}
                                onDragOver={(e) => { if (editMode) e.preventDefault(); }}
                                onDrop={() => onDrop(k)}>
                                {editMode && (
                                    <div className={cn("absolute -inset-1 z-10 rounded-2xl border-2 border-dashed transition-colors", dragKey === k ? "border-indigo-400 bg-indigo-500/10" : "border-white/15 hover:border-indigo-500/40")}>
                                        <div className="absolute -top-3 left-3 right-3 flex items-center gap-1 text-[10px] font-bold">
                                            <span className="flex items-center gap-1 bg-indigo-500 text-white px-2 py-0.5 rounded-full shadow-lg cursor-grab active:cursor-grabbing"><GripVertical className="w-3 h-3" /> {info.label}</span>
                                            <span className="flex items-center gap-0.5 ml-auto bg-slate-900/90 border border-white/10 rounded-full px-1 py-0.5 shadow-lg">
                                                <button onClick={() => muovi(k, -1)} title="Sposta prima" className="p-0.5 rounded hover:bg-white/10 text-slate-300"><ChevronLeft className="w-3 h-3" /></button>
                                                <button onClick={() => muovi(k, 1)} title="Sposta dopo" className="p-0.5 rounded hover:bg-white/10 text-slate-300"><ChevronRight className="w-3 h-3" /></button>
                                                {(info.sizes || [1, 2, 4]).map((sz) => (
                                                    <button key={sz} onClick={() => ridimensiona(k, sz)} title={SIZE_LABEL[sz]}
                                                        className={cn("px-1.5 py-0.5 rounded text-[9px] font-black", s === sz ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-white/10")}>
                                                        {sz === 4 ? "½" : sz}
                                                    </button>
                                                ))}
                                                <button onClick={() => rimuovi(k)} title="Togli dalla Home" className="p-0.5 rounded hover:bg-rose-500/30 text-rose-300"><X className="w-3 h-3" /></button>
                                            </span>
                                        </div>
                                    </div>
                                )}
                                <div className={cn("h-full", editMode && "pointer-events-none opacity-90")}>{contenuto}</div>
                            </div>
                        );
                    })}
                    {layout.length === 0 && (
                        <div className="col-span-full glass-card p-8 text-center text-sm text-slate-400">
                            Home vuota — premi <b>Modifica → Aggiungi widget</b> per comporla.
                        </div>
                    )}
                </div>
            )}

            {/* pannello Aggiungi widget */}
            {addOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
                    <div className="fixed z-50 inset-x-3 top-16 bottom-6 sm:inset-x-auto sm:right-6 sm:w-[420px] glass-card border-white/10 shadow-2xl flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4 text-indigo-300" /> Aggiungi widget</h3>
                            <button onClick={() => setAddOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-4 space-y-4 overflow-y-auto">
                            {GRUPPI.map(([gk, glabel]) => {
                                const voci = disponibili[gk] || [];
                                if (!voci.length) return null;
                                return (
                                    <div key={gk}>
                                        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">{glabel}</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {voci.map((v) => {
                                                const Icon = v.icon;
                                                return (
                                                    <button key={v.id} onClick={() => aggiungi(v.id)}
                                                        className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-left hover:bg-indigo-500/15 hover:border-indigo-500/40 transition-colors group">
                                                        {v.logo ? <img src={v.logo} alt="" className="h-5 w-8 object-contain shrink-0" /> : <Icon className="w-4 h-4 shrink-0" style={{ color: v.accent || "var(--tf-818cf8)" }} />}
                                                        <span className="text-xs font-semibold text-slate-200 truncate flex-1">{v.label}</span>
                                                        <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-300 shrink-0" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {!GRUPPI.some(([gk]) => (disponibili[gk] || []).length) && (
                                <p className="text-xs text-slate-500 text-center py-6">Hai già tutti i widget disponibili in Home. ✅</p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
