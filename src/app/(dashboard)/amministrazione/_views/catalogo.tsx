"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Plus, Trash2, Pencil, ChevronUp, ChevronDown, Power, Layers, Check, X, Settings2 } from "lucide-react";
import { notify, dbError } from "./toast";

/* CATALOGO OPERATORI A 6 LIVELLI (mig. 091/092) — LA BASE DEL DATABASE.
   Gerarchia: Brand > Tipo Cliente > Categoria > Prodotto > Offerta > Opzioni.
   Seed importato 1:1 dall'artifatto di Luca (27/07); da qui l'admin governa
   voci e livelli per ogni operatore. Il Registra Vendita leggerà da queste
   tabelle quando verrà agganciato (dopo verifica del catalogo).
   Regole del modello: livelli 1-5 a selezione singola; Opzioni multiple,
   tranne quelle marcate "1 sola" (gruppo_singolo, es. Reload) che sono
   mutuamente esclusive; un'opzione può chiedere una quantità (tipo 'numero').
   Ogni scrittura RICARICA dal DB il ramo toccato: quello che vedi è ciò che
   è stato davvero salvato. */

const TIPI = ["Consumer", "Business"] as const;

interface Cat { id: string; nome: string; ordine: number; attivo: boolean }
interface Brand { id: string; nome: string; colore1: string; colore2: string; ordine: number; attivo: boolean }
interface Prod { id: string; brand_id: string; tipo_cliente: string; categoria_id: string; nome: string; ordine: number; attivo: boolean }
interface Off { id: string; prodotto_id: string; nome: string; ordine: number; attivo: boolean }
interface Opz { id: string; offerta_id: string; nome: string; tipo: string | null; gruppo_singolo: string | null; ordine: number; attivo: boolean }
interface CampoRegola { nome: string; tipo: string; nota: string; conferma: boolean; attivo?: boolean; facoltativo?: boolean }
/* riga della QUINTA tabella (03/08): campo risolto per l'offerta selezionata,
   con la provenienza — "offerta" = regola dedicata, "generale" = regole comuni */
interface CampoOffRow extends CampoRegola { fonte: "offerta" | "generale" | "nuovo" | "opzione" }
interface RegolaCampi { id?: string; etichetta: string; condizioni: Record<string, string[]>; campi: CampoRegola[]; ordine: number; attivo: boolean }
const COND_KEYS: { k: string; label: string; hint: string }[] = [
    { k: "brand", label: "Brand", hint: "slug: windtre, vodafone, s4…" },
    { k: "tipo", label: "Tipo cliente", hint: "Consumer, Business" },
    { k: "categoria", label: "Categoria", hint: "es. Fisso, Energia" },
    { k: "prodotto", label: "Prodotto", hint: "es. Mobile MNP" },
    { k: "offerta", label: "Offerta (esatta)", hint: "nome esatto — regole per-offerta" },
    { k: "offertaContiene", label: "Offerta contiene", hint: "es. Conv, Indoor" },
    { k: "offertaNon", label: "Offerta esclusa", hint: "nome esatto" },
    { k: "opzioni", label: "Opzione attiva", hint: "es. RID, GNP" },
];
const TIPI_CAMPO = ["testo", "numero", "data", "scelta"];

const byOrd = <T extends { ordine: number; nome: string }>(a: T, b: T) => a.ordine - b.ordine || a.nome.localeCompare(b.nome);

export function CatalogoView() {
    // SYNC catalogo dispositivi universale (Luca 02/08): Apple (ipsw.me) +
    // Android (CSV certificati Google Play) → tabella dispositivi_catalogo
    const [syncDisp, setSyncDisp] = useState<string | null>(null);
    const [syncBusy, setSyncBusy] = useState(false);
    const aggiornaDispositivi = async () => {
        if (syncBusy) return;
        setSyncBusy(true); setSyncDisp(null);
        try {
            const r = await fetch("/api/dispositivi/sync", { method: "POST" });
            const j = await r.json();
            setSyncDisp(j.ok ? `✅ Catalogo aggiornato: ${j.totale_catalogo} dispositivi (Apple ${j.apple}, Android ${j.android})` : "⚠️ " + (j.error || "sync non riuscita"));
        } catch (e) { setSyncDisp("⚠️ " + ((e as Error)?.message || "sync non riuscita")); }
        finally { setSyncBusy(false); }
    };
    const [loading, setLoading] = useState(true);
    const [cats, setCats] = useState<Cat[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [prodotti, setProdotti] = useState<Prod[]>([]);
    const [offerte, setOfferte] = useState<Off[]>([]);
    const [opzioni, setOpzioni] = useState<Opz[]>([]);

    const [brandSel, setBrandSel] = useState<string>("");
    const [tipoSel, setTipoSel] = useState<string>("Consumer");
    const [catSel, setCatSel] = useState<string>("");
    const [prodSel, setProdSel] = useState<string>("");
    const [offSel, setOffSel] = useState<string>("");
    const [gestCat, setGestCat] = useState(false);
    // ── STRATO DATI (mig. 094): regole dei campi vendita, amministrabili qui.
    //    Regola d'oro: mai eliminare campi usati in passato — si NASCONDONO.
    const [vista, setVista] = useState<"catalogo" | "campi">("catalogo");
    const [regole, setRegole] = useState<RegolaCampi[]>([]);
    const [regEdit, setRegEdit] = useState<RegolaCampi | null>(null);   // editor aperto
    // ── QUINTA TABELLA (03/08): campi vendita della singola OFFERTA. null =
    //    sola lettura (risolti); array = modifica in corso, si salva come
    //    regola dedicata con condizione "offerta" esatta e ordine minimo.
    const [campiOff, setCampiOff] = useState<CampoOffRow[] | null>(null);
    // OPZIONI cliccabili (03/08): alcune opzioni AGGIUNGONO campi — spuntandole
    // si vedono; con UNA sola opzione spuntata si personalizzano (regola
    // offerta+opzione). Cambio selezione = si riparte puliti.
    const [opzSel, setOpzSel] = useState<Set<string>>(new Set());
    useEffect(() => { setCampiOff(null); setOpzSel(new Set()); }, [offSel, tipoSel, catSel, prodSel]);

    // editor inline: una sola riga in modifica per volta
    const [edit, setEdit] = useState<{ table: string; id: string; nome: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const loadBase = useCallback(async () => {
        const [c, b, rg] = await Promise.all([
            supabase.from("catalog_categorie").select("*").order("ordine"),
            supabase.from("catalog_brands").select("*").order("ordine"),
            supabase.from("catalog_campi_regole").select("*").order("ordine"),
        ]);
        if (dbError("Caricamento categorie", c.error) || dbError("Caricamento brand", b.error)) return;
        setCats((c.data ?? []) as Cat[]);
        setBrands((b.data ?? []) as Brand[]);
        if (!rg.error) setRegole((rg.data ?? []) as RegolaCampi[]);
        return b.data as Brand[];
    }, []);

    const loadBrand = useCallback(async (bid: string) => {
        if (!bid) { setProdotti([]); setOfferte([]); setOpzioni([]); return; }
        const p = await supabase.from("catalog_prodotti").select("*").eq("brand_id", bid);
        if (dbError("Caricamento prodotti", p.error)) return;
        const prods = (p.data ?? []) as Prod[];
        setProdotti(prods);
        const ids = prods.map((x) => x.id);
        if (!ids.length) { setOfferte([]); setOpzioni([]); return; }
        const o = await supabase.from("catalog_offerte").select("*, catalog_opzioni(*)").in("prodotto_id", ids);
        if (dbError("Caricamento offerte", o.error)) return;
        const offs: Off[] = [], opts: Opz[] = [];
        (o.data ?? []).forEach((row: Off & { catalog_opzioni?: Opz[] }) => {
            const { catalog_opzioni: kids, ...off } = row;
            offs.push(off as Off);
            (kids ?? []).forEach((k) => opts.push(k));
        });
        setOfferte(offs);
        setOpzioni(opts);
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const b = await loadBase();
            const first = (b ?? [])[0]?.id ?? "";
            setBrandSel(first);
            await loadBrand(first);
            setLoading(false);
        })();
    }, [loadBase, loadBrand]);

    const pickBrand = async (bid: string) => {
        setBrandSel(bid); setProdSel(""); setOffSel(""); setEdit(null); setCampiOff(null);
        // se il brand non ha il tipo selezionato, passa all'altro
        await loadBrand(bid);
    };

    /* ── viste derivate ── */
    const prodsTipo = useMemo(() => prodotti.filter((p) => p.tipo_cliente === tipoSel), [prodotti, tipoSel]);
    const countByCat = useMemo(() => {
        const m: Record<string, number> = {};
        prodsTipo.forEach((p) => { m[p.categoria_id] = (m[p.categoria_id] || 0) + 1; });
        return m;
    }, [prodsTipo]);
    const prodsList = useMemo(() => prodsTipo.filter((p) => p.categoria_id === catSel).sort(byOrd), [prodsTipo, catSel]);
    const offsList = useMemo(() => offerte.filter((o) => o.prodotto_id === prodSel).sort(byOrd), [offerte, prodSel]);
    const opzOf = useCallback((oid: string) => opzioni.filter((k) => k.offerta_id === oid).sort(byOrd), [opzioni]);
    const nOffOf = useCallback((pid: string) => offerte.filter((o) => o.prodotto_id === pid).length, [offerte]);
    const brandTot = useMemo(() => ({ p: prodotti.length, o: offerte.length, k: opzioni.length }), [prodotti, offerte, opzioni]);
    const tipiBrand = useMemo(() => TIPI.map((t) => ({ t, n: prodotti.filter((p) => p.tipo_cliente === t).length })), [prodotti]);

    /* ── mutazioni: scrivi → ricarica → conferma ── */
    const run = async (ctx: string, op: () => PromiseLike<{ error: { message?: string } | null }>, okMsg?: string) => {
        if (busy) return false;
        setBusy(true);
        try {
            const { error } = await op();
            if (dbError(ctx, error)) return false;
            await Promise.all([loadBase(), loadBrand(brandSel)]);
            if (okMsg) notify(okMsg, "ok");
            return true;
        } finally { setBusy(false); }
    };

    const saveEdit = async () => {
        if (!edit) return;
        const nome = edit.nome.trim();
        if (!nome) { notify("Il nome non può essere vuoto"); return; }
        const ok = await run("Rinomina", () => supabase.from(edit.table).update({ nome }).eq("id", edit.id), "Rinominato ✓");
        if (ok) setEdit(null);
    };

    const toggleAttivo = (table: string, id: string, attivo: boolean) =>
        run("Attiva/spegni", () => supabase.from(table).update({ attivo: !attivo }).eq("id", id));

    const move = (table: string, list: { id: string; ordine: number }[], id: string, dir: -1 | 1) => {
        const i = list.findIndex((r) => r.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        const a = list[i], b = list[j];
        return run("Riordino", async () => {
            const r1 = await supabase.from(table).update({ ordine: b.ordine === a.ordine ? a.ordine + dir : b.ordine }).eq("id", a.id);
            if (r1.error) return r1;
            return supabase.from(table).update({ ordine: a.ordine }).eq("id", b.id);
        });
    };

    const addRow = (table: string, payload: Record<string, unknown>, nome: string, okMsg: string) => {
        const n = nome.trim();
        if (!n) return Promise.resolve(false);
        return run("Aggiunta", () => supabase.from(table).insert({ ...payload, nome: n }), okMsg);
    };

    const delProdotto = async (p: Prod) => {
        const n = nOffOf(p.id);
        if (!window.confirm(`Eliminare il prodotto "${p.nome}"${n ? ` e le sue ${n} offerte (con relative opzioni)` : ""}? L'operazione è definitiva.`)) return;
        await run("Eliminazione prodotto", () => supabase.from("catalog_prodotti").delete().eq("id", p.id), "Prodotto eliminato");
        if (prodSel === p.id) { setProdSel(""); setOffSel(""); }
    };
    const delOfferta = async (o: Off) => {
        const n = opzOf(o.id).length;
        if (!window.confirm(`Eliminare l'offerta "${o.nome}"${n ? ` e le sue ${n} opzioni` : ""}? L'operazione è definitiva.`)) return;
        await run("Eliminazione offerta", () => supabase.from("catalog_offerte").delete().eq("id", o.id), "Offerta eliminata");
        if (offSel === o.id) setOffSel("");
    };
    const delOpzione = async (k: Opz) => {
        if (!window.confirm(`Eliminare l'opzione "${k.nome}"?`)) return;
        await run("Eliminazione opzione", () => supabase.from("catalog_opzioni").delete().eq("id", k.id), "Opzione eliminata");
    };
    const delCategoria = async (c: Cat) => {
        const { count, error } = await supabase.from("catalog_prodotti").select("id", { count: "exact", head: true }).eq("categoria_id", c.id);
        if (dbError("Verifica categoria", error)) return;
        if ((count ?? 0) > 0) { notify(`"${c.nome}" ha ${count} prodotti nel catalogo (tra tutti i brand): svuotala prima di eliminarla.`); return; }
        if (!window.confirm(`Eliminare la categoria vuota "${c.nome}"?`)) return;
        await run("Eliminazione categoria", () => supabase.from("catalog_categorie").delete().eq("id", c.id), "Categoria eliminata");
        if (catSel === c.id) setCatSel("");
    };

    /* ── STRATO DATI: mutazioni regole campi ── */
    const salvaRegola = async () => {
        if (!regEdit) return;
        const cond: Record<string, string[]> = {};
        COND_KEYS.forEach(({ k }) => { const v = regEdit.condizioni[k]; if (v && v.length) cond[k] = v; });
        const campi = (regEdit.campi || []).filter((c) => c.nome.trim());
        if (!campi.length) { notify("Una regola deve avere almeno un campo"); return; }
        const body = { etichetta: regEdit.etichetta.trim() || "Regola senza nome", condizioni: cond, campi, ordine: regEdit.ordine, attivo: regEdit.attivo };
        const ok = await run("Salvataggio regola", () =>
            regEdit.id ? supabase.from("catalog_campi_regole").update(body).eq("id", regEdit.id)
                : supabase.from("catalog_campi_regole").insert(body), "Regola salvata ✓");
        if (ok) setRegEdit(null);
    };
    const toggleRegola = (r: RegolaCampi) =>
        run("Regola attiva/nascosta", () => supabase.from("catalog_campi_regole").update({ attivo: !r.attivo }).eq("id", r.id!));
    const toggleCampo = (r: RegolaCampi, idx: number) => {
        const campi = r.campi.map((c, i) => i === idx ? { ...c, attivo: c.attivo === false ? true : false } : c);
        return run("Campo visibile/nascosto", () => supabase.from("catalog_campi_regole").update({ campi }).eq("id", r.id!));
    };
    const moveRegola = (r: RegolaCampi, dir: -1 | 1) => {
        const lista = [...regole].sort((a, b) => a.ordine - b.ordine);
        const i = lista.findIndex((x) => x.id === r.id); const j = i + dir;
        if (i < 0 || j < 0 || j >= lista.length) return;
        const a = lista[i], b = lista[j];
        return run("Riordino regole", async () => {
            const r1 = await supabase.from("catalog_campi_regole").update({ ordine: b.ordine === a.ordine ? a.ordine + dir : b.ordine }).eq("id", a.id!);
            if (r1.error) return r1;
            return supabase.from("catalog_campi_regole").update({ ordine: a.ordine }).eq("id", b.id!);
        });
    };
    const delRegola = async (r: RegolaCampi) => {
        if (!window.confirm(`Eliminare la regola "${r.etichetta}"?\n\nATTENZIONE: se i suoi campi sono stati usati in vendite passate è meglio NASCONDERLA (interruttore), non eliminarla. Eliminare comunque?`)) return;
        await run("Eliminazione regola", () => supabase.from("catalog_campi_regole").delete().eq("id", r.id!), "Regola eliminata");
    };
    const nuovaRegola = () => setRegEdit({ etichetta: "", condizioni: {}, campi: [{ nome: "", tipo: "testo", nota: "", conferma: false, attivo: true }], ordine: (regole.reduce((m, r) => Math.max(m, r.ordine), -1) + 1), attivo: true });

    /* ── input "aggiungi" per colonna ── */
    const [newProd, setNewProd] = useState("");
    const [newOff, setNewOff] = useState("");
    const [newOpz, setNewOpz] = useState("");
    const [newCat, setNewCat] = useState("");

    if (loading) return <div className="flex items-center gap-3 text-slate-400 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento catalogo…</div>;

    const brandCur = brands.find((b) => b.id === brandSel);

    /* riga standard con azioni (rinomina, riordina, spegni, elimina) */
    const RowActions = ({ table, row, list, onDel }: { table: string; row: { id: string; nome: string; ordine: number; attivo: boolean }; list: { id: string; ordine: number }[]; onDel: () => void }) => (
        <span className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button title="Rinomina" onClick={(e) => { e.stopPropagation(); setEdit({ table, id: row.id, nome: row.nome }); }} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"><Pencil className="w-3.5 h-3.5" /></button>
            <button title="Sposta su" onClick={(e) => { e.stopPropagation(); move(table, list, row.id, -1); }} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"><ChevronUp className="w-3.5 h-3.5" /></button>
            <button title="Sposta giù" onClick={(e) => { e.stopPropagation(); move(table, list, row.id, 1); }} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"><ChevronDown className="w-3.5 h-3.5" /></button>
            <button title={row.attivo ? "Spegni (non vendibile)" : "Riattiva"} onClick={(e) => { e.stopPropagation(); toggleAttivo(table, row.id, row.attivo); }} className={cn("p-1 rounded hover:bg-white/10", row.attivo ? "text-emerald-400" : "text-slate-600")}><Power className="w-3.5 h-3.5" /></button>
            <button title="Elimina" onClick={(e) => { e.stopPropagation(); onDel(); }} className="p-1 rounded text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
        </span>
    );

    const EditBox = () => edit ? (
        <span className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEdit(null); }}
                className="glass-input text-sm rounded-lg py-1 px-2 flex-1 min-w-0" />
            <button onClick={saveEdit} className="p-1 rounded text-emerald-400 hover:bg-white/10"><Check className="w-4 h-4" /></button>
            <button onClick={() => setEdit(null)} className="p-1 rounded text-slate-400 hover:bg-white/10"><X className="w-4 h-4" /></button>
        </span>
    ) : null;

    /* ── QUINTA TABELLA: campi vendita dell'OFFERTA selezionata (03/08) ──
       Mostra i campi che il venditore compilera' scegliendo QUESTA offerta
       (risolti dalle regole, stessa semantica del Registra Vendita, opzioni
       escluse) e li rende amministrabili: rinomina, aggiungi, togli,
       obbligatorio/facoltativo. Il salvataggio crea/aggiorna UNA regola
       dedicata con condizione "offerta" esatta e ordine minimo: vince sulle
       generali perche' i suoi campi prenotano il nome (lib/campiRegole). */
    const offCur = offerte.find((o) => o.id === offSel);
    const prodCur = prodotti.find((p) => p.id === prodSel);
    const catNomeCur = cats.find((c) => c.id === catSel)?.nome || "";
    const regolaOffertaEsistente = (offNome: string, prodNome: string, opzione?: string) => regole.find((r) => {
        const c = r.condizioni || {};
        const opzOk = opzione ? ((c.opzioni || []).length === 1 && (c.opzioni || [])[0] === opzione) : !(c.opzioni && c.opzioni.length);
        return (c.offerta || []).includes(offNome)
            && opzOk
            && (!c.prodotto || c.prodotto.includes(prodNome))
            && (!c.brand || c.brand.includes(brandSel))
            && (!c.tipo || c.tipo.includes(tipoSel));
    });
    const risolviPerOfferta = (offNome: string, prodNome: string, opzTest: string[] = []): CampoOffRow[] => {
        const attive = [...regole].filter((r) => r.attivo !== false).sort((a, b) => a.ordine - b.ordine);
        const out: CampoOffRow[] = []; const visti = new Set<string>();
        for (const r of attive) {
            const c = r.condizioni || {};
            if (c.brand && !c.brand.includes(brandSel)) continue;
            if (c.tipo && !c.tipo.includes(tipoSel)) continue;
            if (c.categoria && !c.categoria.includes(catNomeCur)) continue;
            if (c.prodotto && !c.prodotto.includes(prodNome)) continue;
            if (c.offerta && !c.offerta.includes(offNome)) continue;
            if (c.offertaNon && c.offertaNon.includes(offNome)) continue;
            if (c.offertaContiene && !c.offertaContiene.some((x) => offNome.toLowerCase().includes(x.toLowerCase()))) continue;
            // campi legati alle OPZIONI: entrano quando l'opzione e' spuntata qui
            if (c.opzioni && !c.opzioni.some((o) => opzTest.includes(o))) continue;
            const daOpzione = !!c.opzioni;
            const propria = !!(c.offerta && c.offerta.includes(offNome));
            for (const cmp of (r.campi || [])) {
                if (visti.has(cmp.nome)) continue;
                visti.add(cmp.nome);
                out.push({ ...cmp, fonte: daOpzione ? "opzione" : propria ? "offerta" : "generale" });
            }
        }
        return out;
    };
    const salvaCampiOfferta = async () => {
        if (!campiOff || !offCur || !prodCur) return;
        const campi = campiOff.filter((c) => c.nome.trim()).map(({ fonte: _f, ...c }) => c);
        if (!campi.length) { notify("Serve almeno un campo — oppure Annulla"); return; }
        const opzione = opzSel.size === 1 ? [...opzSel][0] : undefined;
        const esistente = regolaOffertaEsistente(offCur.nome, prodCur.nome, opzione);
        const body = {
            etichetta: opzione
                ? `🎯🧩 Offerta: ${offCur.nome} + ${opzione} — ${prodCur.nome} (${brandCur?.nome || brandSel} ${tipoSel})`
                : `🎯 Offerta: ${offCur.nome} — ${prodCur.nome} (${brandCur?.nome || brandSel} ${tipoSel})`,
            condizioni: { brand: [brandSel], tipo: [tipoSel], categoria: [catNomeCur], prodotto: [prodCur.nome], offerta: [offCur.nome], ...(opzione ? { opzioni: [opzione] } : {}) },
            campi, attivo: true,
            ordine: esistente ? esistente.ordine : Math.min(0, ...regole.map((r) => r.ordine)) - 1,
        };
        const ok = await run("Campi offerta", () =>
            esistente?.id ? supabase.from("catalog_campi_regole").update(body).eq("id", esistente.id)
                : supabase.from("catalog_campi_regole").insert(body), opzione ? `Campi per ${offCur.nome} + ${opzione} salvati ✓` : "Campi dell'offerta salvati ✓");
        if (ok) setCampiOff(null);
    };
    const upCampoOff = (i: number, patch: Partial<CampoOffRow>) => setCampiOff((p) => p ? p.map((c, x) => x === i ? { ...c, ...patch } : c) : p);
    const pannelloCampiOfferta = offCur && prodCur ? (() => {
        const risolti = risolviPerOfferta(offCur.nome, prodCur.nome, [...opzSel]);
        const inEdit = campiOff !== null;
        const righe = inEdit ? campiOff! : risolti;
        return (
            <div className="glass-card p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                        🧾 Campi vendita dell&apos;offerta <span className="text-amber-300 normal-case tracking-normal">— {offCur.nome}</span>
                        <span className="ml-2 text-slate-600 normal-case tracking-normal font-normal">({prodCur.nome} · {tipoSel} · {brandCur?.nome || brandSel})</span>
                    </h3>
                    {!inEdit ? (
                        <button onClick={() => setCampiOff((opzSel.size === 1 ? risolti.filter((c) => c.fonte === "opzione" || c.fonte === "offerta") : risolti).map((c) => ({ ...c })))}
                            disabled={opzSel.size > 1}
                            title={opzSel.size > 1 ? "Per personalizzare i campi di un'opzione lasciane spuntata UNA sola" : opzSel.size === 1 ? `Personalizza i campi di ${offCur.nome} con l'opzione ${[...opzSel][0]}` : "Personalizza i campi di questa offerta"}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold disabled:opacity-40">
                            <Pencil className="w-3.5 h-3.5" /> {opzSel.size === 1 ? `Personalizza offerta + ${[...opzSel][0]}` : "Personalizza per questa offerta"}
                        </button>
                    ) : (
                        <span className="flex gap-2">
                            <button onClick={() => setCampiOff(null)} className="px-3 py-1.5 rounded-lg border border-white/15 text-slate-300 text-xs font-bold hover:bg-white/5">Annulla</button>
                            <button onClick={salvaCampiOfferta} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"><Check className="w-3.5 h-3.5" /> Salva campi offerta</button>
                        </span>
                    )}
                </div>
                <p className="text-xs text-slate-500 mb-2">
                    Sono le caselle che il venditore compila scegliendo questa offerta. Qui si possono
                    <b className="text-slate-300"> rinominare, aggiungere, togliere</b> e marcare
                    <b className="text-amber-300"> obbligatorie</b> o <b className="text-slate-300">facoltative</b>:
                    le modifiche valgono SOLO per questa offerta (regola dedicata 🎯).
                    <b className="text-slate-300"> Mai eliminare un campo usato in passato: si nasconde.</b>
                </p>
                {/* OPZIONI dell'offerta (03/08): alcune AGGIUNGONO campi — spuntale
                    per vederli (🧩); con UNA sola spuntata, "Personalizza" salva i
                    campi di offerta+opzione (chiesti solo con l'opzione attiva) */}
                {opzOf(offSel).length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Opzioni:</span>
                        {opzOf(offSel).map((k) => (
                            <button key={k.id} disabled={inEdit}
                                onClick={() => setOpzSel((p) => { const n = new Set(p); if (n.has(k.nome)) n.delete(k.nome); else n.add(k.nome); return n; })}
                                className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-50",
                                    opzSel.has(k.nome) ? "border-violet-400/70 bg-violet-500/20 text-violet-100" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25")}>
                                {opzSel.has(k.nome) ? "🧩 " : ""}{k.nome}
                            </button>
                        ))}
                        {opzSel.size > 1 && <span className="text-[10px] text-amber-400">con più opzioni spuntate la vista è cumulativa: per PERSONALIZZARE i campi di un'opzione lasciane spuntata una sola</span>}
                    </div>
                )}
                {!inEdit ? (
                    <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
                        {righe.length === 0 && <p className="text-sm text-slate-600 p-4">Nessun campo per questa offerta: “Personalizza” per aggiungerne.</p>}
                        {righe.map((c, i) => (
                            <div key={i} className={cn("flex items-center gap-3 flex-wrap px-4 py-3 bg-white/[0.02]", c.attivo === false && "opacity-50")}>
                                <span className="text-base" title={c.fonte === "opzione" ? "Campo che compare con un'opzione attiva" : c.fonte === "offerta" ? "Campo della regola dedicata a questa offerta" : "Campo ereditato dalle regole generali"}>{c.fonte === "opzione" ? "🧩" : c.fonte === "offerta" ? "🎯" : "📐"}</span>
                                <span className={cn("text-sm font-semibold", c.attivo === false ? "text-slate-500 line-through" : "text-white")}>{c.nome}</span>
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">{c.tipo}</span>
                                {c.facoltativo
                                    ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-slate-400">facoltativo</span>
                                    : <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">obbligatorio</span>}
                                {c.attivo === false && <span className="text-[10px] font-bold uppercase text-slate-500">nascosto</span>}
                                {c.nota && <span className="text-xs text-slate-500 italic ml-auto">{c.nota}</span>}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {righe.map((c, i) => (
                            <div key={i} className={cn("rounded-xl border border-white/10 bg-white/[0.02] p-3.5", c.attivo === false && "opacity-50")}>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-lg" title={c.fonte === "opzione" ? "Campo legato a un'opzione" : c.fonte === "generale" ? "Ereditato dalle regole generali" : c.fonte === "nuovo" ? "Nuovo campo" : "Della regola di questa offerta"}>{c.fonte === "opzione" ? "🧩" : c.fonte === "generale" ? "📐" : c.fonte === "nuovo" ? "✳️" : "🎯"}</span>
                                    <div className="flex-1 min-w-[240px]">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nome campo</p>
                                        <input value={c.nome} onChange={(e) => upCampoOff(i, { nome: e.target.value })} placeholder="Es. ICCID" className="glass-input text-sm rounded-lg py-2.5 px-3 w-full" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tipo</p>
                                        <select value={c.tipo} onChange={(e) => upCampoOff(i, { tipo: e.target.value })} className="glass-input text-sm rounded-lg py-2.5 px-3">
                                            {TIPI_CAMPO.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1 min-w-[220px]">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nota per il venditore</p>
                                        <input value={c.nota} onChange={(e) => upCampoOff(i, { nota: e.target.value })} placeholder="Es. 19 cifre" className="glass-input text-sm rounded-lg py-2.5 px-3 w-full" />
                                    </div>
                                    <div className="flex items-center gap-2 pt-4">
                                        <button title={c.facoltativo ? "FACOLTATIVO — clicca per renderlo obbligatorio" : "OBBLIGATORIO — clicca per renderlo facoltativo"}
                                            onClick={() => upCampoOff(i, { facoltativo: !c.facoltativo })}
                                            className={cn("px-3 py-2 rounded-lg text-xs font-bold uppercase", c.facoltativo ? "bg-white/5 text-slate-400 border border-white/10" : "bg-amber-500/20 text-amber-300 border border-amber-500/40")}>
                                            {c.facoltativo ? "Facoltativo" : "Obbligatorio"}
                                        </button>
                                        {c.fonte === "nuovo" ? (
                                            <button title="Togli questo campo appena aggiunto" onClick={() => setCampiOff((p) => p ? p.filter((_, x) => x !== i) : p)} className="px-3 py-2 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20">✕ Togli</button>
                                        ) : (
                                            <button title={c.attivo === false ? "Nascosto per questa offerta — clicca per rimetterlo" : "Togli per questa offerta (si nasconde: i dati storici restano)"}
                                                onClick={() => upCampoOff(i, { attivo: c.attivo === false ? true : false })}
                                                className={cn("px-3 py-2 rounded-lg text-xs font-bold border", c.attivo === false ? "bg-white/5 border-white/10 text-slate-400" : "bg-rose-500/10 border-rose-500/40 text-rose-300 hover:bg-rose-500/20")}>
                                                {c.attivo === false ? "🙈 Nascosto — ripristina" : "🗑 Togli (nascondi)"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={() => setCampiOff((p) => [...(p || []), { nome: "", tipo: "testo", nota: "", conferma: false, attivo: true, fonte: "nuovo" }])}
                            className="mt-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold"><Plus className="w-4 h-4" /> Aggiungi campo</button>
                    </div>
                )}
            </div>
        );
    })() : null;

    return (<>
        <div className="mb-3 flex items-center gap-3 flex-wrap">
          <button onClick={aggiornaDispositivi} disabled={syncBusy} className="px-4 py-2.5 rounded-xl border border-indigo-400/50 bg-indigo-500/15 text-indigo-200 text-sm font-bold hover:bg-indigo-500/25 disabled:opacity-50">{syncBusy ? "Aggiornamento in corso…" : "📱 Aggiorna catalogo dispositivi (Apple + Google)"}</button>
          {syncDisp && <span className="text-xs text-slate-300">{syncDisp}</span>}
        </div>
        <div className="space-y-5">
            {/* intestazione */}
            <div className="glass-card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Layers className="w-5 h-5 text-violet-400" /> Catalogo Operatori — 6 livelli</h2>
                        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
                            Brand › Tipo Cliente › Categoria › Prodotto › Offerta › Opzioni. È la base del database:
                            il Registra Vendita leggerà da qui una volta agganciato. Ogni modifica è salvata subito
                            e ricaricata dal DB. Le voci spente restano a catalogo ma non saranno vendibili.
                        </p>
                    </div>
                    <div className="text-right text-xs text-slate-500 leading-5 shrink-0">
                        <div><b className="text-slate-300">{brandCur?.nome || "—"}</b>: {brandTot.p} prodotti · {brandTot.o} offerte · {brandTot.k} opzioni</div>
                        <div>Seed dall&apos;artifatto del 27/07 · brand fissi (11)</div>
                    </div>
                </div>

                {/* il tab "Campi vendita" e' stato tolto (Luca 03/08): i campi si
                    governano dalla tabella per-offerta in fondo alla pagina */}

                {vista === "catalogo" && (<>
                {/* brand */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {brands.map((b) => (
                        <button key={b.id} onClick={() => pickBrand(b.id)}
                            className={cn("flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-bold transition-all",
                                brandSel === b.id ? "border-violet-400/70 bg-violet-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25",
                                !b.attivo && "opacity-50")}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.colore1 || "var(--tf-94a3b8)" }} />
                            {b.nome}
                        </button>
                    ))}
                </div>

                {/* tipo cliente */}
                <div className="flex gap-2 mt-3">
                    {tipiBrand.map(({ t, n }) => (
                        <button key={t} onClick={() => { setTipoSel(t); setProdSel(""); setOffSel(""); setEdit(null); }}
                            disabled={n === 0 && tipoSel !== t}
                            className={cn("px-4 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-widest transition-all",
                                tipoSel === t ? "border-sky-400/70 bg-sky-500/15 text-sky-100" : n === 0 ? "border-white/5 text-slate-600" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25")}>
                            {t} <span className="opacity-60 normal-case tracking-normal">({n})</span>
                        </button>
                    ))}
                </div>
                </>)}
            </div>

            {/* ── STRATO DATI: regole dei campi vendita ── */}
            {vista === "campi" && (
                <div className="glass-card p-4 space-y-2">
                    <div className="flex items-center justify-between px-1">
                        <p className="text-sm text-slate-400 max-w-3xl">
                            Ogni regola dice QUALI CASELLE compila il venditore quando la selezione
                            corrisponde alle condizioni. I campi si sommano tra le regole che scattano.
                            <b className="text-slate-300"> Mai eliminare un campo usato in passato:</b> usa
                            l&apos;occhio per NASCONDERLO — i dati già salvati nelle vendite restano intatti.
                        </p>
                        <button onClick={nuovaRegola} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shrink-0"><Plus className="w-4 h-4" /> Nuova regola</button>
                    </div>
                    {[...regole].sort((a, b) => a.ordine - b.ordine).map((r) => (
                        <div key={r.id} className={cn("rounded-xl border border-white/10 bg-white/[0.03] p-3", !r.attivo && "opacity-50")}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <span className="text-sm font-bold text-white">{r.etichetta}</span>
                                    {!r.attivo && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-slate-400">nascosta</span>}
                                    {Object.keys(r.condizioni || {}).length === 0 && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">sempre</span>}
                                    {COND_KEYS.filter(({ k }) => (r.condizioni || {})[k]?.length).map(({ k, label }) => (
                                        <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">{label}: <b>{(r.condizioni[k] || []).join(", ")}</b></span>
                                    ))}
                                </div>
                                <span className="flex items-center gap-1 shrink-0">
                                    <button title="Modifica" onClick={() => setRegEdit(JSON.parse(JSON.stringify(r)))} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"><Pencil className="w-4 h-4" /></button>
                                    <button title="Su" onClick={() => moveRegola(r, -1)} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"><ChevronUp className="w-4 h-4" /></button>
                                    <button title="Giù" onClick={() => moveRegola(r, 1)} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"><ChevronDown className="w-4 h-4" /></button>
                                    <button title={r.attivo ? "Nascondi regola (i dati storici restano)" : "Riattiva regola"} onClick={() => toggleRegola(r)} className={cn("p-1 rounded hover:bg-white/10", r.attivo ? "text-emerald-400" : "text-slate-600")}><Power className="w-4 h-4" /></button>
                                    <button title="Elimina (sconsigliato: meglio nascondere)" onClick={() => delRegola(r)} className="p-1 rounded text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {(r.campi || []).map((c, i) => (
                                    <span key={i} className={cn("inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border", c.attivo === false ? "border-white/5 text-slate-600 line-through" : "border-white/10 bg-white/[0.04] text-slate-200")}>
                                        {c.nome}
                                        <i className="not-italic text-[9px] uppercase text-slate-500">{c.tipo}</i>
                                        {c.conferma && <i className="not-italic text-[9px] uppercase px-1 rounded bg-amber-500/20 text-amber-300" title="Campo dedotto: da confermare">?</i>}
                                        <button title={c.attivo === false ? "Rendi di nuovo visibile" : "Nascondi campo (i dati storici restano)"} onClick={() => toggleCampo(r, i)} className="text-slate-500 hover:text-white">{c.attivo === false ? "🙈" : "👁"}</button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* editor regola */}
            {regEdit && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setRegEdit(null)}>
                    <div className="glass-card w-full max-w-2xl shadow-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-base font-bold text-white">{regEdit.id ? "Modifica regola campi" : "Nuova regola campi"}</h3>
                            <button onClick={() => setRegEdit(null)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nome della regola</label>
                                <input value={regEdit.etichetta} onChange={(e) => setRegEdit({ ...regEdit, etichetta: e.target.value })} placeholder="es. Energia — dati fornitura" className="glass-input text-sm rounded-lg py-2 px-3 w-full" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Condizioni <span className="normal-case font-normal text-slate-500">(vuoto = vale sempre; più valori separati da virgola)</span></label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {COND_KEYS.map(({ k, label, hint }) => (
                                        <div key={k}>
                                            <div className="text-[10px] text-slate-500 mb-0.5">{label} <i>({hint})</i></div>
                                            <input value={(regEdit.condizioni[k] || []).join(", ")}
                                                onChange={(e) => { const v = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); setRegEdit({ ...regEdit, condizioni: { ...regEdit.condizioni, [k]: v } }); }}
                                                className="glass-input text-xs rounded-lg py-1.5 px-2 w-full" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Campi richiesti</label>
                                <div className="space-y-1.5">
                                    {regEdit.campi.map((c, i) => (
                                        <div key={i} className="flex items-center gap-1.5 flex-wrap">
                                            <input value={c.nome} onChange={(e) => { const campi = [...regEdit.campi]; campi[i] = { ...c, nome: e.target.value }; setRegEdit({ ...regEdit, campi }); }} placeholder="Nome campo" className="glass-input text-xs rounded-lg py-1.5 px-2 flex-1 min-w-[160px]" />
                                            <select value={c.tipo} onChange={(e) => { const campi = [...regEdit.campi]; campi[i] = { ...c, tipo: e.target.value }; setRegEdit({ ...regEdit, campi }); }} className="glass-input text-xs rounded-lg py-1.5 px-2">
                                                {TIPI_CAMPO.map((t) => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <input value={c.nota} onChange={(e) => { const campi = [...regEdit.campi]; campi[i] = { ...c, nota: e.target.value }; setRegEdit({ ...regEdit, campi }); }} placeholder="nota (es. 19 cifre)" className="glass-input text-xs rounded-lg py-1.5 px-2 w-40" />
                                            <button title={c.facoltativo ? "FACOLTATIVO: non blocca il completamento — clicca per renderlo obbligatorio" : "OBBLIGATORIO: blocca il completamento — clicca per renderlo facoltativo"} onClick={() => { const campi = [...regEdit.campi]; campi[i] = { ...c, facoltativo: !c.facoltativo }; setRegEdit({ ...regEdit, campi }); }} className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", c.facoltativo ? "bg-white/5 text-slate-400" : "bg-amber-500/20 text-amber-300")}>{c.facoltativo ? "facolt." : "obblig."}</button>
                                            <button title={c.attivo === false ? "Nascosto — clicca per mostrare" : "Visibile — clicca per nascondere"} onClick={() => { const campi = [...regEdit.campi]; campi[i] = { ...c, attivo: c.attivo === false ? true : false }; setRegEdit({ ...regEdit, campi }); }} className="text-sm">{c.attivo === false ? "🙈" : "👁"}</button>
                                            <button title="Togli riga (solo per campi mai usati)" onClick={() => setRegEdit({ ...regEdit, campi: regEdit.campi.filter((_, x) => x !== i) })} className="p-1 rounded text-rose-400/70 hover:text-rose-300"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => setRegEdit({ ...regEdit, campi: [...regEdit.campi, { nome: "", tipo: "testo", nota: "", conferma: false, attivo: true }] })} className="mt-2 flex items-center gap-1 text-xs font-bold text-violet-300 hover:text-white"><Plus className="w-3.5 h-3.5" /> Aggiungi campo</button>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                                <button onClick={() => setRegEdit(null)} className="px-4 py-2 rounded-lg border border-white/15 text-slate-300 text-sm hover:bg-white/5">Annulla</button>
                                <button onClick={salvaRegola} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold flex items-center gap-1.5"><Check className="w-4 h-4" /> Salva regola</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* colonne a cascata */}
            {vista === "catalogo" && (<>
            <div className="grid grid-cols-12 gap-4 items-start">
                {/* ── CATEGORIE ── */}
                <div className="col-span-12 md:col-span-3 lg:col-span-2 glass-card p-3">
                    <div className="flex items-center justify-between px-1 mb-2">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Categorie</h3>
                        <button title="Gestisci categorie (rinomina, ordina, elimina)" onClick={() => setGestCat(!gestCat)}
                            className={cn("p-1 rounded", gestCat ? "text-violet-300 bg-violet-500/15" : "text-slate-500 hover:text-white")}>
                            <Settings2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="space-y-1">
                        {cats.map((c) => (
                            <div key={c.id} onClick={() => { setCatSel(c.id); setProdSel(""); setOffSel(""); }}
                                className={cn("group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                                    catSel === c.id ? "bg-violet-500/15 text-white border border-violet-400/40" : "text-slate-300 hover:bg-white/[0.05] border border-transparent",
                                    !c.attivo && "opacity-50")}>
                                {edit?.table === "catalog_categorie" && edit.id === c.id ? <EditBox /> : (
                                    <>
                                        <span className="truncate">{c.nome}</span>
                                        <span className="flex items-center gap-1 shrink-0">
                                            {gestCat && <RowActions table="catalog_categorie" row={c} list={cats} onDel={() => delCategoria(c)} />}
                                            <span className={cn("text-[10px] tabular-nums", (countByCat[c.id] || 0) ? "text-slate-400" : "text-slate-600")}>{countByCat[c.id] || 0}</span>
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                    {gestCat && (
                        <div className="flex gap-1 mt-2">
                            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nuova categoria…"
                                onKeyDown={async (e) => { if (e.key === "Enter" && await addRow("catalog_categorie", { ordine: cats.length }, newCat, "Categoria aggiunta")) setNewCat(""); }}
                                className="glass-input text-xs rounded-lg py-1.5 px-2 flex-1 min-w-0" />
                            <button onClick={async () => { if (await addRow("catalog_categorie", { ordine: cats.length }, newCat, "Categoria aggiunta")) setNewCat(""); }}
                                className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10"><Plus className="w-4 h-4" /></button>
                        </div>
                    )}
                </div>

                {/* ── PRODOTTI ── */}
                <div className="col-span-12 md:col-span-4 lg:col-span-4 glass-card p-3">
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-2">
                        Prodotti {catSel && <span className="text-slate-400 normal-case tracking-normal">— {cats.find((c) => c.id === catSel)?.nome}</span>}
                    </h3>
                    {!catSel ? <p className="text-sm text-slate-600 px-1 py-6 text-center">Seleziona una categoria</p> : (
                        <>
                            <div className="space-y-1">
                                {prodsList.length === 0 && <p className="text-sm text-slate-600 px-1 py-4 text-center">Nessun prodotto {brandCur?.nome} {tipoSel} in questa categoria</p>}
                                {prodsList.map((p) => (
                                    <div key={p.id} onClick={() => { setProdSel(p.id); setOffSel(""); }}
                                        className={cn("group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                                            prodSel === p.id ? "bg-sky-500/15 text-white border border-sky-400/40" : "text-slate-300 hover:bg-white/[0.05] border border-transparent",
                                            !p.attivo && "opacity-50")}>
                                        {edit?.table === "catalog_prodotti" && edit.id === p.id ? <EditBox /> : (
                                            <>
                                                <span className="truncate">{p.nome}{!p.attivo && <span className="ml-2 text-[9px] uppercase text-slate-500">spento</span>}</span>
                                                <span className="flex items-center gap-1 shrink-0">
                                                    <RowActions table="catalog_prodotti" row={p} list={prodsList} onDel={() => delProdotto(p)} />
                                                    <span className="text-[10px] text-slate-500 tabular-nums">{nOffOf(p.id)} off.</span>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-1 mt-2">
                                <input value={newProd} onChange={(e) => setNewProd(e.target.value)} placeholder={`Nuovo prodotto ${tipoSel}…`}
                                    onKeyDown={async (e) => { if (e.key === "Enter" && await addRow("catalog_prodotti", { brand_id: brandSel, tipo_cliente: tipoSel, categoria_id: catSel, ordine: prodsList.length }, newProd, "Prodotto aggiunto")) setNewProd(""); }}
                                    className="glass-input text-xs rounded-lg py-1.5 px-2 flex-1 min-w-0" />
                                <button onClick={async () => { if (await addRow("catalog_prodotti", { brand_id: brandSel, tipo_cliente: tipoSel, categoria_id: catSel, ordine: prodsList.length }, newProd, "Prodotto aggiunto")) setNewProd(""); }}
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10"><Plus className="w-4 h-4" /></button>
                            </div>
                        </>
                    )}
                </div>

                {/* ── OFFERTE + OPZIONI ── */}
                <div className="col-span-12 md:col-span-5 lg:col-span-6 glass-card p-3">
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-2">
                        Offerte {prodSel && <span className="text-slate-400 normal-case tracking-normal">— {prodotti.find((p) => p.id === prodSel)?.nome}</span>}
                        <span className="ml-2 text-slate-600 normal-case tracking-normal font-normal">(clicca un&apos;offerta per le sue opzioni)</span>
                    </h3>
                    {!prodSel ? <p className="text-sm text-slate-600 px-1 py-6 text-center">Seleziona un prodotto</p> : (
                        <>
                            <div className="space-y-1">
                                {offsList.length === 0 && <p className="text-sm text-slate-600 px-1 py-4 text-center">Nessuna offerta: aggiungi la prima qui sotto</p>}
                                {offsList.map((o) => {
                                    const kids = opzOf(o.id);
                                    const aperta = offSel === o.id;
                                    return (
                                        <div key={o.id}>
                                            <div onClick={() => setOffSel(aperta ? "" : o.id)}
                                                className={cn("group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                                                    aperta ? "bg-amber-500/10 text-white border border-amber-400/40" : "text-slate-300 hover:bg-white/[0.05] border border-transparent",
                                                    !o.attivo && "opacity-50")}>
                                                {edit?.table === "catalog_offerte" && edit.id === o.id ? <EditBox /> : (
                                                    <>
                                                        <span className="truncate">{o.nome}{!o.attivo && <span className="ml-2 text-[9px] uppercase text-slate-500">spenta</span>}</span>
                                                        <span className="flex items-center gap-1 shrink-0">
                                                            <RowActions table="catalog_offerte" row={o} list={offsList} onDel={() => delOfferta(o)} />
                                                            <span className="text-[10px] text-slate-500 tabular-nums">{kids.length} opz.</span>
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            {aperta && (
                                                <div className="ml-4 mt-1 mb-2 pl-3 border-l border-white/10 space-y-1">
                                                    {kids.length === 0 && <p className="text-xs text-slate-600 py-1">Nessuna opzione su questa offerta</p>}
                                                    {kids.map((k) => (
                                                        <div key={k.id} className={cn("group flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-white/[0.04]", !k.attivo && "opacity-50")}>
                                                            {edit?.table === "catalog_opzioni" && edit.id === k.id ? <EditBox /> : (
                                                                <>
                                                                    <span className="truncate flex items-center gap-1.5">
                                                                        {k.nome}
                                                                        {k.gruppo_singolo && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300" title={`Gruppo "${k.gruppo_singolo}": tra le opzioni con questo gruppo se ne sceglie UNA sola`}>1 sola · {k.gruppo_singolo}</span>}
                                                                        {k.tipo === "numero" && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300" title="Alla selezione chiede una quantità">n°</span>}
                                                                    </span>
                                                                    <span className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        {/* GRUPPI NOMINABILI (Luca 02/08): opzioni con lo STESSO nome di
                                                                            gruppo si escludono a vicenda (es. "security" per Security vs
                                                                            Security Pro, separato da "reload"); vuoto = cumulabile */}
                                                                        <button title={k.gruppo_singolo ? `Gruppo "${k.gruppo_singolo}" — clicca per cambiarlo o svuotarlo` : "Metti in un gruppo di incompatibilità: le opzioni con lo stesso gruppo si escludono a vicenda"}
                                                                            onClick={() => { const g = window.prompt('Gruppo di incompatibilità: le opzioni della STESSA offerta con lo stesso nome di gruppo si escludono a vicenda (se ne sceglie una sola).\nEsempi: "reload", "security". Vuoto = cumulabile con tutto.', k.gruppo_singolo || ""); if (g === null) return; run("Gruppo opzione", () => supabase.from("catalog_opzioni").update({ gruppo_singolo: g.trim().toLowerCase() || null }).eq("id", k.id)); }}
                                                                            className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", k.gruppo_singolo ? "bg-violet-500/25 text-violet-200" : "bg-white/5 text-slate-500 hover:text-white")}>1</button>
                                                                        <button title={k.tipo === "numero" ? "Togli la quantità" : "Chiedi una quantità alla selezione"}
                                                                            onClick={() => run("Tipo opzione", () => supabase.from("catalog_opzioni").update({ tipo: k.tipo === "numero" ? null : "numero" }).eq("id", k.id))}
                                                                            className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", k.tipo === "numero" ? "bg-sky-500/25 text-sky-200" : "bg-white/5 text-slate-500 hover:text-white")}>n°</button>
                                                                        <RowActions table="catalog_opzioni" row={k} list={kids} onDel={() => delOpzione(k)} />
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <div className="flex gap-1 pt-1">
                                                        <input value={newOpz} onChange={(e) => setNewOpz(e.target.value)} placeholder="Nuova opzione…"
                                                            onKeyDown={async (e) => { if (e.key === "Enter" && await addRow("catalog_opzioni", { offerta_id: o.id, ordine: kids.length }, newOpz, "Opzione aggiunta")) setNewOpz(""); }}
                                                            className="glass-input text-xs rounded-lg py-1 px-2 flex-1 min-w-0" />
                                                        <button onClick={async () => { if (await addRow("catalog_opzioni", { offerta_id: o.id, ordine: kids.length }, newOpz, "Opzione aggiunta")) setNewOpz(""); }}
                                                            className="p-1 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10"><Plus className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex gap-1 mt-2">
                                <input value={newOff} onChange={(e) => setNewOff(e.target.value)} placeholder="Nuova offerta…"
                                    onKeyDown={async (e) => { if (e.key === "Enter" && await addRow("catalog_offerte", { prodotto_id: prodSel, ordine: offsList.length }, newOff, "Offerta aggiunta")) setNewOff(""); }}
                                    className="glass-input text-xs rounded-lg py-1.5 px-2 flex-1 min-w-0" />
                                <button onClick={async () => { if (await addRow("catalog_offerte", { prodotto_id: prodSel, ordine: offsList.length }, newOff, "Offerta aggiunta")) setNewOff(""); }}
                                    className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10"><Plus className="w-4 h-4" /></button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {/* QUINTA TABELLA (03/08): campi vendita della singola offerta */}
            {pannelloCampiOfferta}
            </>)}
        </div>
    </>);
}
