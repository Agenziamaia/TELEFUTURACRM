"use client";

/* COMMISSIONING € FRANCHISING W3 — l'ESPLOSIONE del pay per attivazione:
   ogni tipo di vendita col suo € per soglia, già pronto da pescare —
   l'analisi dovrà solo dire quale soglia ha raggiunto il PDV/la rete.
   COMPLETATO 14/08 (Luca «ora passo al commissioning»): oltre alle piste a
   canone (mobile/fisso additive come la lettera, assicurazioni a
   moltiplicatore) qui vivono anche Business P.IVA (premio unitario a evento
   per soglia di rete — la colonna S4 da 55€ esiste solo col BP Plus+ e non
   si mostra), Luce&Gas (gettoni a scala) e Customer Base (gettoni flat).
   Le componenti non deducibili dall'offerta (linea aggiuntiva, FTTH,
   opzioni) le aggiunge l'analisi: elencate sotto le tabelle. */

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { esclusaDalleGare, matchComponenti, matchRigaTabellare, PayRiga } from "@/lib/commissioning";
import { cn } from "@/utils";

interface OffCanone {
    id: string; nome: string; canone: number; prodotto: string; tipo_cliente: string; categoria: string;
}

// sezioni della scheda: canone = esploso per offerta (canone × componenti);
// evento = € diretti per soglia; flat = gettone secco per evento
// la gara BUSINESS non è più una sezione a parte (Luca 14/08): è un premio a
// evento che SI SOMMA all'attivazione — vive nelle colonne 💼 dentro Mobile,
// Fisso e sulla riga business di Luce&Gas.
// SEPARAZIONE DEI COLORI (Luca 14/08 sera-3): il VERDE è riservato a ciò che
// è CALCOLATO dalle Regole di gara (canone × componenti); i GETTONI one-shot
// della lettera (telefoni, Luce&Gas, Customer Base) vivono QUI in celle
// EDITABILI — di serie li riempirà l'upload della gara mensile.
const SEZIONI = [
    { id: "mobile", label: "📱 Mobile", tipo: "canone", sub: "canone × componenti (base + MNP + Tied + P.IVA) + contrattuale — le colonne 💼 sono il premio a evento della gara Business, in aggiunta" },
    { id: "device", label: "📞 Telefoni & device", tipo: "device", sub: "gettoni one-shot della lettera per fascia di prezzo e finanziamento — editabili; l'analisi li aggancia al modello scelto in Registra Vendita" },
    { id: "fisso", label: "🏠 Fisso", tipo: "canone", sub: "canone × componenti (base + Convergenza + FWA + P.IVA) + contrattuale — le colonne 💼 sono il premio a evento della gara Business, in aggiunta" },
    { id: "fisso_extra", label: "🎁 Extra fisso", tipo: "device", sub: "gettoni delle opzioni (Netflix, Cloud, Più Sicuri Ufficio, FRITZ!Box) — editabili; si accendono da soli dalle opzioni della vendita e si sommano al pay del fisso" },
    { id: "lucegas", label: "⚡ Luce & Gas", tipo: "evento", sub: "gettoni a scala per offerta (la convergenza +25 è già dentro le Multiservice) + modificatori: Pronto assistenza +10, Bollettino −15 — sul microbusiness in più le colonne 💼 della gara Business" },
    { id: "assicurazioni", label: "🛡 Assicurazioni", tipo: "canone", sub: "canone della polizza × moltiplicatore (dalle Regole di gara)" },
    { id: "protetti", label: "🏠🛡 W3 Protetti (kit)", tipo: "device", sub: "commissioning dei kit dalla slide — editabile; si distingue col kit scelto in vendita, manca solo il dato finanziato/non (campo in arrivo)" },
    { id: "cb", label: "🔁 Customer Base", tipo: "flat", sub: "gettone per evento, senza soglia — editabile" },
] as const;

// etichette corte delle componenti per la scomposizione nel tooltip
const COMP_LABEL: Record<string, string> = {
    base: "base", base_underground: "base Underground", mnp: "MNP", tied: "Tied",
    piva: "P.IVA", conv: "Convergenza", la: "Linea agg.", ftth: "FTTH", fwa: "FWA", opzioni: "Opzioni",
    contrattuale: "contrattuale", contrattuale_conv: "contrattuale conv.", contrattuale_voce: "contrattuale Voce Casa",
    contrattuale_untied: "contrattuale Untied", contrattuale_tied: "contrattuale Tied",
};
// componenti che il pannello non può accendere da solo: dipendono dalla
// vendita (le applica l'analisi leggendo campi e opzioni)
const COMP_RUNTIME = new Set(["la", "ftth", "opzioni"]);

export function W3CommissioningPanel({ mese, colore }: { mese: string; colore: string }) {
    const monthISO = `${mese}-01`;
    const [righe, setRighe] = useState<PayRiga[]>([]);
    const [offerte, setOfferte] = useState<OffCanone[]>([]);
    const [tierMax, setTierMax] = useState<Record<string, number>>({});   // pista → n. soglie vere
    const [loading, setLoading] = useState(true);
    const [cerca, setCerca] = useState("");
    const [aperte, setAperte] = useState<Set<string>>(new Set(["mobile"]));

    useEffect(() => {
        let vivo = true;
        (async () => {
            const [r, sg] = await Promise.all([
                // niente filtro attivo: i gettoni device sono spenti (in attesa
                // dell'aggancio listino) ma vanno mostrati ed editati qui; i
                // matcher del motore scartano da soli le righe spente
                supabase.from("pay_righe")
                    .select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine")
                    .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
                    .neq("pista", "partnership").limit(500),
                supabase.from("pay_soglie").select("pista, tier")
                    .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda"),
            ]);
            const rows = ((r.data ?? []) as PayRiga[])
                .map(x => ({ ...x, punti: Number(x.punti || 0), pay_base: x.pay_base == null ? null : Number(x.pay_base), pay_tiers: (Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : []) }));
            const tm: Record<string, number> = {};
            ((sg.data ?? []) as { pista: string; tier: number }[]).forEach(s => { tm[s.pista] = Math.max(tm[s.pista] || 0, Number(s.tier)); });
            // catalogo: prodotti → offerte con canone (per le sezioni a canone)
            const [cats, prods] = await Promise.all([
                supabase.from("catalog_categorie").select("id, nome"),
                supabase.from("catalog_prodotti").select("id, nome, tipo_cliente, categoria_id").eq("brand_id", "windtre").eq("attivo", true),
            ]);
            const nomeCat = new Map(((cats.data ?? []) as { id: string; nome: string }[]).map(c => [c.id, c.nome]));
            const prodDi = new Map(((prods.data ?? []) as { id: string; nome: string; tipo_cliente: string; categoria_id: string }[]).map(p => [p.id, p]));
            const ids = [...prodDi.keys()];
            const offs: OffCanone[] = [];
            for (let i = 0; i < ids.length; i += 60) {
                const o = await supabase.from("catalog_offerte").select("id, prodotto_id, nome, canone_mensile").in("prodotto_id", ids.slice(i, i + 60)).eq("attivo", true).not("canone_mensile", "is", null);
                ((o.data ?? []) as { id: string; prodotto_id: string; nome: string; canone_mensile: number }[]).forEach(x => {
                    const p = prodDi.get(x.prodotto_id);
                    if (!p || esclusaDalleGare({ offerta: x.nome })) return;
                    offs.push({ id: x.id, nome: x.nome, canone: Number(x.canone_mensile), prodotto: p.nome, tipo_cliente: p.tipo_cliente, categoria: String(nomeCat.get(p.categoria_id) || "") });
                });
            }
            if (!vivo) return;
            setRighe(rows);
            setTierMax(tm);
            setOfferte(offs);
            setLoading(false);
        })();
        return () => { vivo = false; };
    }, [monthISO]);

    // set di righe dell'offerta a canone: componenti additive (modello lettera)
    // con ripiego sul pick-one classico (assicurazioni, mesi senza componenti)
    const setPer = (o: OffCanone): PayRiga[] => {
        const c = { tipo_cliente: o.tipo_cliente, categoria: o.categoria, prodotto: o.prodotto, offerta: o.nome };
        const comp = matchComponenti(righe, c);
        if (comp) return comp;
        const r = matchRigaTabellare(righe, c);
        return r ? [r] : [];
    };

    const filtro = (testo: string) => !cerca.trim() || testo.toLowerCase().includes(cerca.toLowerCase());

    // GARA BUSINESS a colonne (Luca 14/08): per le attivazioni Business il
    // premio a evento (25/35/45 € alla soglia di rete, target nella tabella
    // sopra) si somma al pay — qui compare nelle colonne 💼 S1-S3
    const bizRighe = useMemo(() => righe.filter(r => r.pista === "business_piva"), [righe]);
    const bizN = bizRighe.length ? Math.min(3, tierMax["business_piva"] || 3) : 0;
    const bizInfo = (c: { tipo_cliente: string; categoria?: string | null; prodotto?: string | null; offerta?: string | null }): { scale: number[]; punti: number } | null => {
        if (!/business/i.test(c.tipo_cliente || "") || !bizRighe.length) return null;
        const r = matchRigaTabellare(bizRighe, { tipo_cliente: c.tipo_cliente, categoria: c.categoria, prodotto: c.prodotto, offerta: c.offerta });
        if (!r) return null;
        return { scale: r.pay_tiers.slice(0, bizN), punti: Number(r.punti || 0) };
    };
    const CellaBiz = ({ info, i }: { info: { scale: number[]; punti: number } | null; i: number }) => {
        if (!info || info.scale[i] == null) return <td className="px-1.5 py-0.5 text-center text-slate-700">—</td>;
        return (
            <td className="px-1.5 py-0.5 text-center font-semibold text-sky-300 tabular-nums cursor-help"
                onMouseEnter={e => mostraTip(e, [
                    { testo: `💼 Gara Business · soglia S${i + 1}`, stile: "formula" },
                    { testo: `· premio a evento: ${eur(info.scale[i])} €`, stile: "voce" },
                    { testo: `· quest'attivazione vale ${it(info.punti)} punti business`, stile: "voce" },
                    { testo: "si somma al pay dell'attivazione", stile: "flat" },
                ])}
                onMouseLeave={() => setTip(null)}>
                +{eur(info.scale[i])} €
            </td>
        );
    };

    const perPista = useMemo(() => {
        const out: Record<string, { o: OffCanone; set: PayRiga[] }[]> = { mobile: [], fisso: [], assicurazioni: [] };
        offerte.forEach(o => {
            const set = setPer(o);
            if (!set.length) return;
            const pista = set[0].pista;
            if (!pista || !(pista in out)) return;
            if (!set.some(r => r.pay_tiers.length)) return;
            if (!filtro(`${o.nome} ${o.prodotto} ${o.tipo_cliente}`)) return;
            out[pista].push({ o, set });
        });
        for (const k of Object.keys(out))
            out[k].sort((a, b) => a.o.tipo_cliente.localeCompare(b.o.tipo_cliente) || a.o.prodotto.localeCompare(b.o.prodotto) || a.o.nome.localeCompare(b.o.nome));
        return out;
    }, [offerte, righe, cerca]);   // eslint-disable-line react-hooks/exhaustive-deps

    const eur = (v: number) => (Math.round(v * 100) / 100).toLocaleString("it-IT", { minimumFractionDigits: v % 1 ? 2 : 0 });
    const it = (v: number) => Number(v).toLocaleString("it-IT");
    const toggle = (id: string) => setAperte(prev => { const c = new Set(prev); if (c.has(id)) c.delete(id); else c.add(id); return c; });
    // GETTONI EDITABILI (Luca 14/08 sera-3): device, Luce&Gas e Customer Base
    // si correggono QUI — draft per riga (`id` = pay_base, `id|i` = tier),
    // salvataggio unico col bottone 💾 in testa al pannello
    const [payDraft, setPayDraft] = useState<Record<string, string>>({});
    const dirtyPay = Object.keys(payDraft).length > 0;
    const numPay = (v: string, fallback: number | null) => {
        if (v.trim() === "") return null;
        const n = Number(v.replace(",", "."));
        return Number.isFinite(n) ? n : fallback;
    };
    const salvaPay = async () => {
        const perRiga = new Map<string, Record<string, string>>();
        Object.entries(payDraft).forEach(([k, v]) => {
            const [id, i] = k.split("|");
            const e = perRiga.get(id) || {};
            e[i ?? "base"] = v;
            perRiga.set(id, e);
        });
        for (const [id, mods] of perRiga) {
            const r = righe.find(x => x.id === id);
            if (!r) continue;
            const patch: { pay_base?: number | null; pay_tiers?: number[] } = {};
            if (mods["base"] != null) patch.pay_base = numPay(mods["base"], r.pay_base);
            const tierKeys = Object.keys(mods).filter(x => x !== "base");
            if (tierKeys.length) {
                const tiers = [...r.pay_tiers];
                tierKeys.forEach(tk => { const nv = numPay(mods[tk], tiers[Number(tk)]); if (nv != null) tiers[Number(tk)] = nv; });
                patch.pay_tiers = tiers;
            }
            const { error } = await supabase.from("pay_righe").update(patch).eq("id", id);
            if (error) { alert("Errore salvataggio gettoni: " + error.message); return; }
        }
        setPayDraft({});
        // ricarica le righe (stessa query del mount)
        const r2 = await supabase.from("pay_righe")
            .select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine")
            .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
            .neq("pista", "partnership").limit(500);
        setRighe(((r2.data ?? []) as PayRiga[])
            .map(x => ({ ...x, punti: Number(x.punti || 0), pay_base: x.pay_base == null ? null : Number(x.pay_base), pay_tiers: (Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : []) })));
    };
    // input di un gettone editabile (NON verde: il verde è il calcolato)
    const inputPay = "bg-white/[0.05] border border-white/15 rounded-lg px-1.5 py-0.5 text-[13px] font-semibold text-white w-16 text-center tabular-nums";

    // SOTTOCARTELLE richiudibili (Luca 14/08): i gruppi Consumer/Business e
    // tipo·prodotto si chiudono cliccando l'intestazione; la ricerca li riapre
    const [chiusi, setChiusi] = useState<Set<string>>(new Set());
    const toggleGruppo = (k: string) => setChiusi(prev => { const c = new Set(prev); if (c.has(k)) c.delete(k); else c.add(k); return c; });
    const gruppoChiuso = (k: string) => !cerca.trim() && chiusi.has(k);
    // TOOLTIP VERO sulla scomposizione (Luca 14/08: il title nativo era lento
    // e dentro le tabelle a scorrimento spesso non compariva): una bolla
    // fissa e immediata sopra la cella, con formula, componenti e totale
    type TipRiga = { testo: string; stile: "formula" | "voce" | "flat" | "tot" };
    const [tip, setTip] = useState<{ x: number; y: number; righe: TipRiga[] } | null>(null);
    const mostraTip = (e: React.MouseEvent, righe: TipRiga[]) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setTip({ x: r.left + r.width / 2, y: r.top, righe });
    };
    const righeTip = (canone: number, moltParti: PayRiga[], i: number, flat: number): TipRiga[] => {
        const molt = Math.round(moltParti.reduce((s, r) => s + r.pay_tiers[i], 0) * 100) / 100;
        return [
            { testo: `${eur(canone)} € × ${it(molt)}`, stile: "formula" },
            ...moltParti.map(r => ({ testo: `· ${it(r.pay_tiers[i])} ${r.componente ? (COMP_LABEL[r.componente] || r.componente) : r.nome}`, stile: "voce" as const })),
            ...(flat ? [{ testo: `+ ${eur(flat)} € contrattuale`, stile: "flat" as const }] : []),
            { testo: `= ${eur(canone * molt + flat)} €`, stile: "tot" },
        ];
    };

    if (loading) return null;

    return (
        <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Commissioning in € — il pay di ogni attivazione, per soglia: la soglia raggiunta sceglie la colonna
                </div>
                <div className="flex items-center gap-2">
                    {dirtyPay && (
                        <button onClick={salvaPay} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">💾 Salva gettoni</button>
                    )}
                    <div className="relative w-64">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca offerta o evento…"
                            className="glass-input !h-8 text-xs w-full pl-8" />
                    </div>
                </div>
            </div>
            {SEZIONI.map(sez => {
                const aperta = aperte.has(sez.id) || !!cerca.trim();
                /* ---- TELEFONI & DEVICE: gettoni one-shot della lettera,
                   celle EDITABILI (Luca 14/08 sera-3) — righe spente per il
                   motore finché l'analisi non aggancia il listino ---- */
                if (sez.tipo === "device") {
                    // 'device' = lista piatta di gettoni editabili: telefoni
                    // (pista mobile non-componente), extra fisso (componenti
                    // gettone: Netflix, Cloud…) o kit Protetti
                    const rr = righe.filter(r => {
                        if (!r.gettone || !filtro(`${r.nome} ${r.opzione || ""}`)) return false;
                        if (sez.id === "protetti") return r.pista === "protetti";
                        if (sez.id === "fisso_extra") return r.pista === "fisso" && !(r.componente || "").startsWith("contrattuale");
                        return r.pista === "mobile" && !r.componente;
                    }).sort((a, b) => a.ordine - b.ordine);
                    if (!rr.length) return null;
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {sez.label} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} voci`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse max-w-3xl">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Voce</th>
                                                <th className="px-2 py-1.5 font-semibold text-center w-24">Gettone</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rr.map(r => (
                                                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                    <td className="px-3 py-1 text-slate-200">
                                                        {r.nome.replace(/^Gettone device · /, "")}
                                                        {Number(r.punti) > 0 && <span className="text-[10px] text-sky-300/80 ml-1.5" title="Vale anche punti in soglia">+{it(Number(r.punti))} punti</span>}
                                                        {!r.attivo && <span className="text-[10px] text-slate-500 ml-1.5" title={r.note || ""}>in attesa di aggancio</span>}
                                                    </td>
                                                    <td className="px-2 py-1 text-center">
                                                        <input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                            onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                            className={inputPay} /> <span className="text-[11px] text-slate-500">€</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- MOBILE: una riga per OFFERTA con le diramazioni
                   GA/MNP × Untied/Tied sotto (proposta Luca 14/08 — la lista
                   piatta ripeteva la stessa offerta 2-4 volte senza dire
                   quale variante fosse; le offerte solo MNP, es. Underground,
                   mostrano naturalmente meno diramazioni) ---- */
                if (sez.tipo === "canone" && sez.id === "mobile") {
                    const rr = perPista[sez.id];
                    if (!rr?.length) return null;
                    const maxT = Math.max(...rr.map(x => Math.max(...x.set.map(r => r.pay_tiers.length))));
                    type Variante = { o: OffCanone; set: PayRiga[]; label: string; ord: number };
                    const gruppi: { tipo: string; nome: string; vars: Variante[] }[] = [];
                    const idxG = new Map<string, number>();
                    rr.forEach(({ o, set }) => {
                        const mnp = /mnp/i.test(o.prodotto);
                        const tied = /ric\.?\s*auto/i.test(o.categoria);
                        const k = `${o.tipo_cliente}|${o.nome}`;
                        if (!idxG.has(k)) { idxG.set(k, gruppi.length); gruppi.push({ tipo: o.tipo_cliente, nome: o.nome, vars: [] }); }
                        gruppi[idxG.get(k)!].vars.push({
                            o, set,
                            label: `${mnp ? "MNP" : "GA"} · ${tied ? "Tied" : "Untied"}`,
                            ord: (mnp ? 2 : 0) + (tied ? 1 : 0),
                        });
                    });
                    gruppi.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
                    gruppi.forEach(g => g.vars.sort((a, b) => a.ord - b.ord));
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {sez.label} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${gruppi.length} offerte`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub} — ogni offerta con le sue diramazioni GA/MNP · Untied/Tied</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Offerta / variante</th>
                                                {Array.from({ length: bizN }, (_, i) => <th key={`b${i}`} className="px-1.5 py-1.5 font-semibold text-center w-16 text-sky-300/80">💼 S{i + 1}</th>)}
                                                <th className="px-1.5 py-1.5 font-semibold text-center w-20">Canone</th>
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gruppi.map((g, gi) => {
                                                const nuovoTipo = gi === 0 || g.tipo !== gruppi[gi - 1].tipo;
                                                const kTipo = `mobile|${g.tipo}`;
                                                const chiuso = gruppoChiuso(kTipo);
                                                return (
                                                    <Fragment key={`${g.tipo}|${g.nome}`}>
                                                        {nuovoTipo && (
                                                            <tr className="bg-white/[0.04] cursor-pointer hover:bg-white/[0.07]" onClick={() => toggleGruppo(kTipo)}>
                                                                <td colSpan={2 + bizN + maxT} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                    {chiuso ? "▸" : "▾"} {g.tipo === "Business" ? "💼" : "👤"} {g.tipo}
                                                                    {chiuso && <span className="normal-case tracking-normal font-normal text-slate-500"> · {gruppi.filter(x => x.tipo === g.tipo).length} offerte</span>}
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {!chiuso && (
                                                        <tr className="border-t border-white/[0.06]">
                                                            <td colSpan={2 + bizN + maxT} className="px-3 pt-2 pb-0.5 font-semibold text-white">{g.nome}</td>
                                                        </tr>
                                                        )}
                                                        {!chiuso && g.vars.map(v => (
                                                            <tr key={v.o.id} className="hover:bg-white/[0.03]">
                                                                <td className="pl-7 pr-2 py-0.5 whitespace-nowrap">
                                                                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full border",
                                                                        /Tied/.test(v.label) && !/Untied/.test(v.label)
                                                                            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                                                                            : "border-white/10 bg-white/[0.04] text-slate-300")}>
                                                                        {v.label}
                                                                    </span>
                                                                </td>
                                                                {Array.from({ length: bizN }, (_, i) => (
                                                                    <CellaBiz key={`b${i}`} info={bizInfo(v.o)} i={i} />
                                                                ))}
                                                                <td className="px-1.5 py-0.5 text-center text-[12px] text-slate-400 tabular-nums">{eur(v.o.canone)} €</td>
                                                                {Array.from({ length: maxT }, (_, i) => {
                                                                    const moltParti = v.set.filter(r => r.moltiplicatore && r.pay_tiers[i] != null);
                                                                    if (!moltParti.length) return <td key={i} className="px-1.5 py-0.5 text-center text-slate-700">—</td>;
                                                                    const flat = v.set.filter(r => !r.moltiplicatore).reduce((s, r) => s + Number(r.pay_base || 0), 0);
                                                                    const molt = Math.round(moltParti.reduce((s, r) => s + r.pay_tiers[i], 0) * 100) / 100;
                                                                    return (
                                                                        <td key={i} className="px-1.5 py-0.5 text-center font-semibold text-emerald-200 tabular-nums cursor-help"
                                                                            onMouseEnter={e => mostraTip(e, righeTip(v.o.canone, moltParti, i, flat))}
                                                                            onMouseLeave={() => setTip(null)}>
                                                                            {eur(v.o.canone * molt + flat)} €
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {(() => {
                                        const runtime = righe.filter(r => r.pista === "mobile" && r.componente && COMP_RUNTIME.has(r.componente));
                                        return runtime.length ? (
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                ➕ Componenti che dipendono dalla vendita (le aggiunge l&apos;analisi):{" "}
                                                {runtime.map(r => `${r.nome.replace(/\s*×\s*canone\s*$/i, "")} (${r.pay_tiers.map(it).join("/")})`).join(" · ")} ×canone.
                                            </p>
                                        ) : null;
                                    })()}
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- sezioni a CANONE: esploso per offerta ---- */
                if (sez.tipo === "canone") {
                    const rr = perPista[sez.id];
                    if (!rr?.length) return null;
                    const maxT = Math.max(...rr.map(x => Math.max(...x.set.map(r => r.pay_tiers.length))));
                    const runtime = righe.filter(r => r.pista === sez.id && r.componente && COMP_RUNTIME.has(r.componente));
                    // sulle assicurazioni ogni polizza porta i suoi punti in
                    // soglia (Luca 14/08): colonna prima del canone
                    const conPunti = sez.id === "assicurazioni";
                    // sul fisso i Business hanno anche le colonne 💼 della gara Business
                    const conBiz = sez.id === "fisso" && bizN > 0;
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {sez.label} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} offerte`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Offerta</th>
                                                <th className="text-left font-semibold px-2 py-1.5">Prodotto</th>
                                                {conPunti && <th className="px-2 py-1.5 font-semibold text-center w-24">Punti in soglia</th>}
                                                {conBiz && Array.from({ length: bizN }, (_, i) => <th key={`b${i}`} className="px-1.5 py-1.5 font-semibold text-center w-16 text-sky-300/80">💼 S{i + 1}</th>)}
                                                <th className="px-1.5 py-1.5 font-semibold text-center w-20">Canone</th>
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rr.map(({ o, set }, idx) => {
                                                const gruppo = `${o.tipo_cliente}|${o.prodotto}`;
                                                const nuovoGruppo = idx === 0 || gruppo !== `${rr[idx - 1].o.tipo_cliente}|${rr[idx - 1].o.prodotto}`;
                                                const kGruppo = `${sez.id}|${gruppo}`;
                                                const chiuso = gruppoChiuso(kGruppo);
                                                return (
                                                    <Fragment key={o.id}>
                                                        {nuovoGruppo && (
                                                            <tr className="bg-white/[0.04] cursor-pointer hover:bg-white/[0.07]" onClick={() => toggleGruppo(kGruppo)}>
                                                                <td colSpan={(conPunti ? 4 : 3) + (conBiz ? bizN : 0) + maxT} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                    {chiuso ? "▸" : "▾"} {o.tipo_cliente === "Business" ? "💼" : "👤"} {o.tipo_cliente} · {o.prodotto}
                                                                    {chiuso && <span className="normal-case tracking-normal font-normal text-slate-500"> · {rr.filter(x => `${x.o.tipo_cliente}|${x.o.prodotto}` === gruppo).length} offerte</span>}
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {!chiuso && (
                                                        <tr className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                            <td className="px-3 py-1 text-slate-200 whitespace-nowrap">{o.nome}</td>
                                                            <td className="px-2 py-1 text-[11px] text-slate-500 whitespace-nowrap">{o.prodotto}</td>
                                                            {conPunti && <td className="px-2 py-1 text-center font-bold text-white tabular-nums">{it(set.reduce((s, r) => s + Number(r.punti || 0), 0))}</td>}
                                                            {conBiz && Array.from({ length: bizN }, (_, i) => (
                                                                <CellaBiz key={`b${i}`} info={bizInfo(o)} i={i} />
                                                            ))}
                                                            <td className="px-1.5 py-1 text-center text-[12px] text-slate-400 tabular-nums">{eur(o.canone)} €</td>
                                                            {Array.from({ length: maxT }, (_, i) => {
                                                                const moltParti = set.filter(r => r.moltiplicatore && r.pay_tiers[i] != null);
                                                                if (!moltParti.length) return <td key={i} className="px-1.5 py-1 text-center text-slate-700">—</td>;
                                                                const flat = set.filter(r => !r.moltiplicatore).reduce((s, r) => s + Number(r.pay_base || 0), 0);
                                                                const molt = Math.round(moltParti.reduce((s, r) => s + r.pay_tiers[i], 0) * 100) / 100;
                                                                return (
                                                                    <td key={i} className="px-1.5 py-1 text-center font-semibold text-emerald-200 tabular-nums cursor-help"
                                                                        onMouseEnter={e => mostraTip(e, righeTip(o.canone, moltParti, i, flat))}
                                                                        onMouseLeave={() => setTip(null)}>
                                                                        {eur(o.canone * molt + flat)} €
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {!!runtime.length && (
                                        <p className="text-[11px] text-slate-500 mt-1">
                                            ➕ Componenti che dipendono dalla vendita (le aggiunge l&apos;analisi):{" "}
                                            {runtime.map(r => `${r.nome.replace(/\s*×\s*canone\s*$/i, "")} (${r.pay_tiers.map(it).join("/")})`).join(" · ")} ×canone.
                                        </p>
                                    )}
                                    {/* gettoni assicurazioni SENZA canone (Pronto Intervento,
                                        Giro X Il Mondo): non passano dall'esploso a canone —
                                        tabellina editabile qui sotto (Luca 14/08) */}
                                    {sez.id === "assicurazioni" && (() => {
                                        const gg = righe.filter(r => r.pista === "assicurazioni" && r.gettone && filtro(r.nome)).sort((a, b) => a.ordine - b.ordine);
                                        if (!gg.length) return null;
                                        return (
                                            <div className="mt-2">
                                                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Gettoni senza canone</p>
                                                <table className="w-full text-sm border-collapse max-w-xl">
                                                    <tbody>
                                                        {gg.map(r => (
                                                            <tr key={r.id} className="border-t border-white/[0.04]">
                                                                <td className="px-3 py-1 text-slate-200">{r.nome}{!r.attivo && <span className="text-[10px] text-slate-500 ml-1.5" title={r.note || ""}>in attesa dell&apos;importo premio</span>}</td>
                                                                <td className="px-2 py-1 text-center w-24">
                                                                    <input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                                        onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                                        className={inputPay} /> <span className="text-[11px] text-slate-500">€</span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- sezioni a EVENTO: € diretti per soglia di rete ---- */
                if (sez.tipo === "evento") {
                    const rr = righe.filter(r => r.pista === sez.id && !r.gettone && r.pay_tiers.length && filtro(`${r.nome} ${r.offerta || ""}`))
                        .sort((a, b) => a.ordine - b.ordine);
                    if (!rr.length) return null;
                    // colonne = soglie VERE della pista
                    const maxT = Math.min(tierMax[sez.id] || 99, Math.max(...rr.map(r => r.pay_tiers.length)));
                    // (l'unica sezione a evento rimasta è Luce&Gas: niente colonna punti)
                    const conPunti = false;
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {sez.label} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} voci`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Attivazione</th>
                                                {conPunti && <th className="px-2 py-1.5 font-semibold text-center w-24">Punti in soglia</th>}
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                                {bizN > 0 && Array.from({ length: bizN }, (_, i) => <th key={`b${i}`} className="px-1.5 py-1.5 font-semibold text-center w-16 text-sky-300/80">💼 S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rr.map(r => (
                                                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                    <td className="px-3 py-1 text-slate-200 whitespace-nowrap">{r.nome}</td>
                                                    {conPunti && <td className="px-2 py-1 text-center font-bold text-white tabular-nums">{it(r.punti)}</td>}
                                                    {Array.from({ length: maxT }, (_, i) => (
                                                        <td key={i} className="px-1.5 py-1 text-center">
                                                            {r.pay_tiers[i] == null ? <span className="text-slate-700">—</span> : (
                                                                <input value={payDraft[`${r.id}|${i}`] ?? String(r.pay_tiers[i])}
                                                                    onChange={e => setPayDraft(prev => ({ ...prev, [`${r.id}|${i}`]: e.target.value }))}
                                                                    className={inputPay} />
                                                            )}
                                                        </td>
                                                    ))}
                                                    {bizN > 0 && Array.from({ length: bizN }, (_, i) => (
                                                        <CellaBiz key={`b${i}`} info={bizInfo({ tipo_cliente: r.tipo_cliente || "", categoria: r.categoria, prodotto: r.prodotto, offerta: r.offerta })} i={i} />
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {sez.id === "lucegas" && (
                                        <>
                                            <p className="text-[11px] text-slate-500 mt-1">Gettoni regressivi, includono il contrattuale 10 €: −50% sui clienti ex W3 Luce&amp;Gas Powered by Acea.</p>
                                            {/* modificatori additivi (scorporo Luca 14/08): si accendono
                                                dalle opzioni della vendita e si sommano al gettone base */}
                                            {(() => {
                                                const gg = righe.filter(r => r.pista === "lucegas" && r.gettone && filtro(r.nome)).sort((a, b) => a.ordine - b.ordine);
                                                if (!gg.length) return null;
                                                return (
                                                    <div className="mt-2">
                                                        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Modificatori (dalle opzioni della vendita)</p>
                                                        <table className="w-full text-sm border-collapse max-w-xl">
                                                            <tbody>
                                                                {gg.map(r => (
                                                                    <tr key={r.id} className="border-t border-white/[0.04]">
                                                                        <td className="px-3 py-1 text-slate-200">{r.nome}</td>
                                                                        <td className="px-2 py-1 text-center w-24">
                                                                            <input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                                                onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                                                className={inputPay} /> <span className="text-[11px] text-slate-500">€</span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- Customer Base: gettoni flat ---- */
                const rr = righe.filter(r => r.pista === sez.id && r.gettone && filtro(`${r.nome} ${r.offerta || ""}`))
                    .sort((a, b) => (a.tipo_cliente || "").localeCompare(b.tipo_cliente || "") || a.ordine - b.ordine);
                if (!rr.length) return null;
                return (
                    <div key={sez.id} className="mb-3 last:mb-0">
                        <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                            {sez.label} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} eventi`}</span>
                        </button>
                        <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                        {aperta && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse max-w-xl">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                            <th className="text-left font-semibold px-3 py-1.5">Evento</th>
                                            <th className="px-2 py-1.5 font-semibold text-center w-24">Gettone</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rr.map((r, idx) => {
                                            const nuovoGruppo = idx === 0 || (r.tipo_cliente || "") !== (rr[idx - 1].tipo_cliente || "");
                                            const kGruppo = `cb|${r.tipo_cliente || ""}`;
                                            const chiuso = gruppoChiuso(kGruppo);
                                            return (
                                                <Fragment key={r.id}>
                                                    {nuovoGruppo && (
                                                        <tr className="bg-white/[0.04] cursor-pointer hover:bg-white/[0.07]" onClick={() => toggleGruppo(kGruppo)}>
                                                            <td colSpan={2} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                {chiuso ? "▸" : "▾"} {r.tipo_cliente === "Business" ? "💼 Business" : "👤 Consumer"}
                                                                {chiuso && <span className="normal-case tracking-normal font-normal text-slate-500"> · {rr.filter(x => (x.tipo_cliente || "") === (r.tipo_cliente || "")).length} eventi</span>}
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {!chiuso && (
                                                    <tr className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                        <td className="px-3 py-1 text-slate-200">{r.nome}{Number(r.pay_base) === 0 && <span className="text-[10px] text-slate-500 ml-1.5" title={r.note || ""}>esclusa per lettera</span>}</td>
                                                        <td className="px-2 py-1 text-center">
                                                            <input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                                onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                                className={inputPay} /> <span className="text-[11px] text-slate-500">€</span>
                                                        </td>
                                                    </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
            <p className="text-[11px] text-slate-500 mt-2">
                🟢 Verde = calcolato dalle Regole di gara (canone × componenti) · ⬜ celle bianche = gettoni one-shot della lettera, editabili qui (li riempirà l&apos;upload della gara mensile).
                💼 Colonne Business: premio a evento della gara Business alla soglia di rete (target e importi nella tabella sopra) — si somma al pay; retroattivo, 4ª soglia solo col BP Plus+; contano anche le Protezione Pro Negozi (5 punti).
            </p>
            {/* bolla di scomposizione: in PORTAL sul body — il backdrop-filter
                del glass-panel rompe il position:fixed dei discendenti (le
                coordinate diventavano relative al pannello: bolla lontanissima,
                baco visto da Luca 14/08) */}
            {tip && typeof document !== "undefined" && createPortal(
                <div className="fixed z-50 -translate-x-1/2 -translate-y-full pointer-events-none" style={{ left: tip.x, top: tip.y - 8 }}>
                    <div className="rounded-xl border border-white/15 bg-slate-900/95 shadow-2xl px-3 py-2 text-[11px] leading-relaxed whitespace-nowrap">
                        {tip.righe.map((r, i) => (
                            <div key={i} className={
                                r.stile === "formula" ? "font-bold text-white text-[12px]" :
                                    r.stile === "tot" ? "font-bold text-emerald-300 border-t border-white/10 mt-1 pt-1" :
                                        r.stile === "flat" ? "text-amber-300" : "text-slate-400"
                            }>{r.testo}</div>
                        ))}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
