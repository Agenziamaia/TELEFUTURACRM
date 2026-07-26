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

const byOrd = <T extends { ordine: number; nome: string }>(a: T, b: T) => a.ordine - b.ordine || a.nome.localeCompare(b.nome);

export function CatalogoView() {
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

    // editor inline: una sola riga in modifica per volta
    const [edit, setEdit] = useState<{ table: string; id: string; nome: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const loadBase = useCallback(async () => {
        const [c, b] = await Promise.all([
            supabase.from("catalog_categorie").select("*").order("ordine"),
            supabase.from("catalog_brands").select("*").order("ordine"),
        ]);
        if (dbError("Caricamento categorie", c.error) || dbError("Caricamento brand", b.error)) return;
        setCats((c.data ?? []) as Cat[]);
        setBrands((b.data ?? []) as Brand[]);
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
        setBrandSel(bid); setProdSel(""); setOffSel(""); setEdit(null);
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

    return (
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

                {/* brand */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {brands.map((b) => (
                        <button key={b.id} onClick={() => pickBrand(b.id)}
                            className={cn("flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-bold transition-all",
                                brandSel === b.id ? "border-violet-400/70 bg-violet-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25",
                                !b.attivo && "opacity-50")}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.colore1 || "#94a3b8" }} />
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
            </div>

            {/* colonne a cascata */}
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
                                                                        {k.gruppo_singolo && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300" title={`Gruppo "${k.gruppo_singolo}": tra queste opzioni se ne sceglie UNA sola`}>1 sola</span>}
                                                                        {k.tipo === "numero" && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300" title="Alla selezione chiede una quantità">n°</span>}
                                                                    </span>
                                                                    <span className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button title={k.gruppo_singolo ? "Rendi cumulabile" : "Rendi a scelta singola (gruppo reload)"}
                                                                            onClick={() => run("Gruppo opzione", () => supabase.from("catalog_opzioni").update({ gruppo_singolo: k.gruppo_singolo ? null : "reload" }).eq("id", k.id))}
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
        </div>
    );
}
