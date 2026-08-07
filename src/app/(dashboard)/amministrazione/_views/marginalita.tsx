"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Plus, Trash2, Package, Wrench, AlertTriangle, Link2 } from "lucide-react";
import { notify, dbError } from "./toast";
import { MoneyInput } from "./money";

/* Catalogo MARGINALITÀ amministrabile (mig. 082): categorie e voci con IVA,
   regime margine (costo fisso | % sul prezzo), valore visibile ai collaboratori
   (alimenterà le gare) e brand collegato per l'auto-aggiunta dal flusso brand.
   La pagina Registra Vendita leggerà da qui col redesign del flusso. */

const BRAND_OPTIONS = ["WindTre", "Vodafone", "Fastweb", "Iliad", "Sky", "S4", "TIM", "Very Mobile", "Ho. Mobile", "Kena Mobile", "Dojo"];
const VAT_OPTIONS = [22, 10, 4, 0];

/* CAT-03: set curato di emoji per le icone di voci e categorie (le storiche di
   Registra Vendita + generiche); in piu' campo libero per qualsiasi emoji. */
const EMOJI_SET = [
    "🎧", "📱", "📲", "📶", "🔄", "♻️", "📦", "💳", "🔲", "💾",
    "⌚", "🔋", "🪫", "🔧", "🔨", "💿", "📀", "✂️", "📞", "☎️",
    "🧭", "🧾", "🛡️", "🏷️", "🔖", "💰", "💶", "⚡", "🔌", "🖨️",
    "🖥️", "💻", "🖱️", "🎮", "📡", "🔒", "🧰", "🎁", "🛒", "⭐",
];

/* Bottone-icona con popover (portal su body: i glass-panel hanno overflow-hidden
   e taglierebbero un popover assoluto). value NULL = fallback. */
function IconPicker({ value, onPick, fallback, title }: { value: string | null; onPick: (v: string | null) => void; fallback: ReactNode; title?: string }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [free, setFree] = useState("");
    const toggle = (e: ReactMouseEvent<HTMLButtonElement>) => {
        if (open) { setOpen(false); return; }
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ top: Math.min(r.bottom + 6, Math.max(8, window.innerHeight - 260)), left: Math.max(8, Math.min(r.left, window.innerWidth - 310)) });
        setFree("");
        setOpen(true);
    };
    const pick = (v: string | null) => { onPick(v); setOpen(false); };
    return (
        <>
            <button type="button" onClick={toggle} title={title} className="w-8 h-8 shrink-0 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-base leading-none">
                {value ? <span>{value}</span> : fallback}
            </button>
            {open && pos && createPortal(
                <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
                    <div className="fixed z-[91] w-72 p-2.5 rounded-xl glass-panel shadow-2xl" style={{ top: pos.top, left: pos.left }}>
                        <div className="grid grid-cols-8 gap-1">
                            {EMOJI_SET.map((e) => (
                                <button key={e} type="button" onClick={() => pick(e)} className={cn("h-8 rounded-md hover:bg-white/10 text-base leading-none", value === e && "bg-violet-500/25 ring-1 ring-violet-400/50")}>{e}</button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                            <input value={free} onChange={(e) => setFree(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && free.trim()) pick(free.trim()); }} placeholder="emoji libera…" className="glass-input flex-1 py-1 text-sm" />
                            <button type="button" onClick={() => { if (free.trim()) pick(free.trim()); }} className="primary-btn text-xs px-2.5 py-1.5">OK</button>
                            <button type="button" onClick={() => pick(null)} title="Torna all'icona di default" className="text-[11px] text-slate-500 hover:text-rose-400 whitespace-nowrap px-1">nessuna</button>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}

interface MargCat {
    id: string;
    name: string;
    kind: string;
    sort_order: number;
    active: boolean;
    icon: string | null;
}
interface MargItem {
    id: string;
    category_id: string;
    name: string;
    brand: string | null;
    vat_rate: number;
    cost_mode: string;
    company_cost: number | null;
    margin_percent: number | null;
    default_price: number | null;
    visible_value: number | null;
    auto_link: boolean;
    active: boolean;
    sort_order: number;
    icon: string | null;
}

export function MarginalitaView() {
    const [cats, setCats] = useState<MargCat[]>([]);
    const [items, setItems] = useState<MargItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState(false);
    const [openCat, setOpenCat] = useState<string | null>(null);
    const [nCat, setNCat] = useState("");
    const [nKind, setNKind] = useState("prodotti");

    const load = useCallback(async () => {
        setLoading(true);
        const [c, i] = await Promise.all([
            supabase.from("marg_categories").select("*").order("sort_order"),
            supabase.from("marg_items").select("*").order("sort_order").order("created_at"),
        ]);
        if (c.error) {
            setMissing(true);
            setLoading(false);
            return;
        }
        setMissing(false);
        setCats((c.data as MargCat[]) || []);
        setItems((i.data as MargItem[]) || []);
        setLoading(false);
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    const addCat = async () => {
        if (!nCat.trim()) return;
        const { error } = await supabase.from("marg_categories").insert({ name: nCat.trim(), kind: nKind, sort_order: cats.length });
        if (!dbError("Creazione categoria", error)) {
            setNCat("");
            load();
        }
    };
    const delCat = async (c: MargCat) => {
        const { error } = await supabase.from("marg_categories").delete().eq("id", c.id);
        if (!dbError("Eliminazione categoria", error)) {
            notify(`Categoria «${c.name}» eliminata (con le sue voci)`, "ok");
            load();
        }
    };
    // CAT-03: icona di categoria (in Registra Vendita appare nel tab, al reload)
    const setCatIcon = async (c: MargCat, icon: string | null) => {
        const { error } = await supabase.from("marg_categories").update({ icon }).eq("id", c.id);
        if (!dbError("Icona categoria", error)) load();
    };

    const totali = useMemo(() => {
        const withCost = items.filter((i) => (i.cost_mode === "costo_fisso" ? i.company_cost != null : i.margin_percent != null)).length;
        return { voci: items.length, withCost, linked: items.filter((i) => i.brand).length };
    }, [items]);

    // Coefficiente BUNDLE Vodafone (Luca 07/08: «dev'essere legato al pannello
    // amministrativo»): ce_parametri 'bundle_coeff_default' — a DB è una
    // frazione (0.60), qui si amministra in %. Lo consuma Registra Vendita
    // (margine della voce bundle = importo × coefficiente).
    const [bundlePct, setBundlePct] = useState<string>("");
    const [bundleSalvo, setBundleSalvo] = useState(false);
    useEffect(() => {
        supabase.from("ce_parametri").select("valore_num").eq("chiave", "bundle_coeff_default").is("month", null)
            .then(({ data }) => { const v = data?.[0]?.valore_num; if (v != null) setBundlePct(String(Math.round(Number(v) * 10000) / 100).replace(".", ",")); });
    }, []);
    const salvaBundle = async () => {
        const pct = Number(String(bundlePct).replace(",", "."));
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) { notify("Percentuale non valida: serve un numero tra 0 e 100", "error"); return; }
        setBundleSalvo(true);
        const { error } = await supabase.from("ce_parametri").update({ valore_num: pct / 100, updated_at: new Date().toISOString() })
            .eq("chiave", "bundle_coeff_default").is("month", null);
        if (!dbError("Salvataggio coefficiente bundle", error)) notify(`Coefficiente bundle: ${String(pct).replace(".", ",")}% — vale per le nuove vendite`, "ok");
        setBundleSalvo(false);
    };

    if (loading)
        return (
            <div className="flex justify-center py-16 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );

    if (missing)
        return (
            <div className="glass-panel p-8 text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-white font-semibold">Catalogo non ancora inizializzato sul database</p>
                <p className="text-sm text-slate-400 max-w-lg mx-auto">
                    La migrazione <span className="text-slate-200">082_marg_catalog.sql</span> è nel repository e crea il catalogo
                    con tutte le voci attuali già dentro: va applicata al database (Rahib la applica al prossimo giro).
                </p>
            </div>
        );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-xs text-slate-500 max-w-xl">
                    Il catalogo di <span className="text-slate-300">Prodotti & Marginalità</span>: per ogni voce IVA, regime margine
                    (<span className="text-slate-300">costo fisso</span> → utile = prezzo − costo azienda ·{" "}
                    <span className="text-slate-300">% margine</span> → utile = prezzo × %), <span className="text-slate-300">valore visibile</span> ai
                    collaboratori (per le gare) e brand collegato per l&apos;auto-aggiunta al carrello.
                </p>
                <p className="text-xs text-slate-400 whitespace-nowrap">
                    {totali.voci} voci · {totali.withCost} con margine definito · {totali.linked} legate a brand
                </p>
            </div>

            {/* Parametri trasversali (Luca 07/08): il coefficiente bundle si
                amministra QUI, non a codice né via DB */}
            <div className="glass-panel p-3.5 flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-white">🎁 Coefficiente bundle Vodafone</span>
                <span className="text-xs text-slate-500 flex-1 min-w-[220px]">
                    quota del valore del bundle che diventa marginalità: margine = importo del bundle × coefficiente
                </span>
                <div className="flex items-center gap-1.5">
                    <input value={bundlePct} onChange={(e) => setBundlePct(e.target.value)}
                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white text-right outline-none focus:border-indigo-400" />
                    <span className="text-sm text-slate-400">%</span>
                    <button onClick={salvaBundle} disabled={bundleSalvo}
                        className="ml-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-semibold">
                        Salva
                    </button>
                </div>
            </div>

            {cats.map((c) => {
                const its = items.filter((i) => i.category_id === c.id);
                const open = openCat === c.id;
                return (
                    <div key={c.id} className="glass-panel overflow-hidden">
                        <div className={cn("flex items-center gap-2.5 p-3.5", open && "border-b border-white/5")}>
                            <IconPicker value={c.icon} onPick={(v) => setCatIcon(c, v)} title="Icona categoria — appare nel tab di Prodotti & Marginalità (Registra Vendita, al reload)"
                                fallback={c.kind === "servizi" ? <Wrench className="w-4 h-4 text-teal-400" /> : <Package className="w-4 h-4 text-violet-400" />} />
                            <button onClick={() => setOpenCat(open ? null : c.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                                <span className="text-[15px] font-bold text-white">{c.name}</span>
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", c.kind === "servizi" ? "text-teal-300 border-teal-500/25 bg-teal-500/10" : "text-violet-300 border-violet-500/25 bg-violet-500/10")}>
                                    {c.kind === "servizi" ? "SERVIZI" : "PRODOTTI"}
                                </span>
                                <span className="text-[11px] text-slate-500">{its.length} voci</span>
                            </button>
                            <button onClick={() => delCat(c)} className="text-slate-600 hover:text-rose-400 p-1" title="Elimina categoria"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        {open && <CatItems catId={c.id} items={its} onChange={load} />}
                    </div>
                );
            })}

            <div className="flex gap-2">
                <input value={nCat} onChange={(e) => setNCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCat()} placeholder="Nuova categoria (es. Wearable, Configurazioni…)" className="glass-input flex-1 text-sm" />
                <select value={nKind} onChange={(e) => setNKind(e.target.value)} className="glass-input w-auto text-sm">
                    <option value="prodotti">Prodotti</option>
                    <option value="servizi">Servizi</option>
                </select>
                <button onClick={addCat} className="px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-sm border border-white/10 whitespace-nowrap flex items-center gap-1.5"><Plus className="w-4 h-4" /> Categoria</button>
            </div>
        </div>
    );
}

function CatItems({ catId, items, onChange }: { catId: string; items: MargItem[]; onChange: () => void }) {
    const [nName, setNName] = useState("");

    const add = async () => {
        if (!nName.trim()) return;
        const { error } = await supabase.from("marg_items").insert({ category_id: catId, name: nName.trim(), sort_order: items.length });
        if (!dbError("Creazione voce", error)) {
            setNName("");
            onChange();
        }
    };

    return (
        <div className="p-3.5 space-y-1.5">
            {/* intestazione colonne */}
            <div className="hidden xl:flex items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-slate-600">
                <span className="w-8 text-center">Icona</span>
                <span className="flex-1">Voce</span>
                <span className="w-32">Brand</span>
                <span className="w-16 text-center">IVA</span>
                <span className="w-28">Regime</span>
                <span className="w-28 text-right">Costo / %</span>
                <span className="w-28 text-right">Prezzo default</span>
                <span className="w-28 text-right">Visibile (gare)</span>
                <span className="w-14 text-center">Auto</span>
                <span className="w-6"></span>
            </div>
            {items.map((r) => (
                <ItemRow key={r.id} r={r} onChange={onChange} />
            ))}
            {!items.length && <p className="text-xs text-slate-600 px-1">Nessuna voce.</p>}
            <div className="flex gap-2 pt-1">
                <input value={nName} onChange={(e) => setNName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nuova voce…" className="glass-input flex-1 py-1.5 text-sm" />
                <button onClick={add} className="primary-btn text-sm px-3 py-1.5">Aggiungi</button>
            </div>
        </div>
    );
}

function ItemRow({ r, onChange }: { r: MargItem; onChange: () => void }) {
    const [f, setF] = useState(r);
    useEffect(() => setF(r), [r]);
    const [confirmDel, setConfirmDel] = useState(false);

    const save = async (patch?: Partial<MargItem>) => {
        const x = { ...f, ...patch };
        const { error } = await supabase.from("marg_items").update({
            name: x.name, brand: x.brand, vat_rate: x.vat_rate, cost_mode: x.cost_mode,
            company_cost: x.company_cost, margin_percent: x.margin_percent,
            default_price: x.default_price, visible_value: x.visible_value,
            auto_link: x.auto_link, active: x.active, icon: x.icon,
        }).eq("id", r.id);
        if (!dbError("Salvataggio voce", error)) onChange();
    };
    const del = async () => {
        const { error } = await supabase.from("marg_items").delete().eq("id", r.id);
        if (!dbError("Eliminazione voce", error)) onChange();
    };

    return (
        <div className={cn("glass-card p-2 rounded-lg flex flex-wrap xl:flex-nowrap items-center gap-2", !f.active && "opacity-50")}>
            <IconPicker value={f.icon} onPick={(v) => { setF({ ...f, icon: v }); save({ icon: v }); }}
                title={f.brand ? "Icona voce — nei quadratoni di Registra Vendita prevale il logo del brand collegato" : "Icona voce (emoji nei quadratoni di Registra Vendita, al reload)"}
                fallback={<span className="text-slate-600 text-[11px]">—</span>} />
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => save()} className="glass-input flex-1 min-w-[130px] py-1 text-sm" />
            <select value={f.brand ?? ""} onChange={(e) => { const v = e.target.value || null; setF({ ...f, brand: v }); save({ brand: v }); }} className="glass-input w-32 py-1 text-[11px]" title="Brand collegato">
                <option value="">— nessun brand —</option>
                {BRAND_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={f.vat_rate} onChange={(e) => { const v = Number(e.target.value); setF({ ...f, vat_rate: v }); save({ vat_rate: v }); }} className="glass-input w-16 py-1 text-[11px] text-center" title="Aliquota IVA">
                {VAT_OPTIONS.map((v) => <option key={v} value={v}>{v}%</option>)}
            </select>
            <select value={f.cost_mode} onChange={(e) => { setF({ ...f, cost_mode: e.target.value }); save({ cost_mode: e.target.value }); }} className="glass-input w-28 py-1 text-[11px]" title="Regime margine">
                <option value="costo_fisso">costo fisso</option>
                <option value="percent_margine">% margine</option>
            </select>
            {f.cost_mode === "costo_fisso" ? (
                <MoneyInput value={f.company_cost} onChange={(v) => setF({ ...f, company_cost: v })} onCommit={() => save()} wrapClass="w-28" className="py-1 text-sm" title="Costo azienda" placeholder="costo" />
            ) : (
                <span className="relative inline-block w-28">
                    <input type="number" step="0.1" min="0" max="100" value={f.margin_percent ?? ""} onChange={(e) => setF({ ...f, margin_percent: e.target.value ? Number(e.target.value) : null })} onBlur={() => save()} placeholder="%" className="glass-input w-full py-1 text-sm text-right pr-6" title="% margine sul prezzo" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span>
                </span>
            )}
            <MoneyInput value={f.default_price} onChange={(v) => setF({ ...f, default_price: v })} onCommit={() => save()} wrapClass="w-28" className="py-1 text-sm" title="Prezzo proposto (vuoto = libero)" placeholder="libero" />
            <MoneyInput value={f.visible_value} onChange={(v) => setF({ ...f, visible_value: v })} onCommit={() => save()} wrapClass="w-28" className="py-1 text-sm" title="Valore visibile ai collaboratori (per gare)" placeholder="visibile" />
            <button
                onClick={() => { const v = !f.auto_link; setF({ ...f, auto_link: v }); save({ auto_link: v }); }}
                className={cn("w-14 py-1 rounded-full border text-[9px] font-bold flex items-center justify-center gap-0.5", f.auto_link ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "text-slate-600 border-white/10")}
                title="Auto-aggiunta al carrello quando si registra dal flusso brand collegato"
            >
                <Link2 className="w-3 h-3" /> auto
            </button>
            {confirmDel ? (
                <span className="flex items-center gap-1">
                    <button onClick={del} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina</button>
                    <button onClick={() => setConfirmDel(false)} className="text-[10px] text-slate-500 px-1">Annulla</button>
                </span>
            ) : (
                <button onClick={() => setConfirmDel(true)} className="text-slate-600 hover:text-rose-400 p-1 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
        </div>
    );
}
