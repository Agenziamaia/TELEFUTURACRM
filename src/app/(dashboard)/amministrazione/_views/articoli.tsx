"use client";
/* ═══════════════════════════════════════════════════════════════════════════
   ARTICOLI — la definizione (Luca 29/08)

   «Nel momento in cui crei un articolo il prezzo di vendita deve essere
    sicuramente il dato obbligatorio. Poi ci saranno degli articoli che hanno
    un prezzo di vendita modificabile e degli altri che invece hanno un prezzo
    di vendita che non è modificabile. Questo varrà anche per i servizi. Tutto
    questo deve essere impostabile all'interno del pannello amministrativo.»

   Il magazzino in negozio (Lab → Magazzino → Articoli) si CONSULTA e basta.
   Qui si DEFINISCE: prezzo, costo, e se in cassa quel prezzo si può toccare.

   Non è un catalogo da riempire a mano: gli articoli arrivano dall'export del
   gestionale. Qui si sistemano i tre numeri che decidono cosa vede la cassa.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Search, Lock, Unlock, AlertTriangle } from "lucide-react";

type Art = {
    codice: string; barcode: string | null; descrizione: string;
    gruppo: string | null; sottogruppo: string | null; marca: string | null;
    costo_ultimo: number | null; prezzo: number | null;
    prezzo_modificabile: boolean; attivo: boolean;
};

const eur = (n: number | null | undefined) =>
    n == null ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Quando un articolo non è pronto per la cassa, e perché. Un articolo senza
 *  prezzo non si può vendere; uno senza costo si vende ma non sappiamo quanto
 *  ci guadagniamo; uno che costa più di quanto lo vendiamo è un errore di
 *  dato (o una perdita voluta, ma va vista). */
function problemaDi(a: Art): string | null {
    if (a.prezzo == null) return "senza prezzo di vendita: in cassa non si può vendere";
    if (a.costo_ultimo == null) return "senza costo d'acquisto: il margine resta ignoto";
    if (a.costo_ultimo > 5000) return "il costo sembra un codice a barre finito nel campo sbagliato";
    if (a.costo_ultimo > a.prezzo) return "costa più di quanto lo vendiamo";
    return null;
}

export function ArticoliView() {
    const [righe, setRighe] = useState<Art[] | null>(null);
    const [q, setQ] = useState("");
    const [soloProblemi, setSoloProblemi] = useState(false);
    const [salvo, setSalvo] = useState<string | null>(null);
    const [bozza, setBozza] = useState<Record<string, Partial<Art>>>({});

    const carica = async () => {
        const out: Art[] = [];
        for (let da = 0; ; da += 1000) {
            const { data } = await supabase.from("mag_articoli")
                .select("codice,barcode,descrizione,gruppo,sottogruppo,marca,costo_ultimo,prezzo,prezzo_modificabile,attivo")
                .order("descrizione").range(da, da + 999);
            if (!data?.length) break;
            out.push(...(data as Art[]));
            if (data.length < 1000) break;
        }
        setRighe(out);
    };
    useEffect(() => { carica(); }, []);

    const conProblema = useMemo(() => (righe || []).filter((a) => a.attivo && problemaDi(a)).length, [righe]);

    const visibili = useMemo(() => {
        let v = (righe || []).filter((a) => a.attivo);
        if (soloProblemi) v = v.filter((a) => problemaDi(a));
        const t = q.trim().toLowerCase();
        if (t) {
            const parole = t.split(/\s+/);
            v = v.filter((a) => {
                const s = `${a.descrizione} ${a.codice} ${a.barcode || ""} ${a.marca || ""}`.toLowerCase();
                return parole.every((p) => s.includes(p));
            });
        }
        return v.slice(0, 200);
    }, [righe, q, soloProblemi]);

    const val = (a: Art, k: keyof Art) => (bozza[a.codice] && k in bozza[a.codice] ? bozza[a.codice][k] : a[k]);
    const cambia = (a: Art, k: keyof Art, v: unknown) => setBozza((p) => ({ ...p, [a.codice]: { ...p[a.codice], [k]: v } }));

    const salva = async (a: Art) => {
        const b = bozza[a.codice]; if (!b) return;
        setSalvo(a.codice);
        const patch: Record<string, unknown> = {};
        if ("prezzo" in b) patch.prezzo = b.prezzo === null || b.prezzo === undefined || (b.prezzo as unknown) === "" ? null : Number(b.prezzo);
        if ("costo_ultimo" in b) patch.costo_ultimo = b.costo_ultimo === null || b.costo_ultimo === undefined || (b.costo_ultimo as unknown) === "" ? null : Number(b.costo_ultimo);
        if ("prezzo_modificabile" in b) patch.prezzo_modificabile = !!b.prezzo_modificabile;
        const { error } = await supabase.from("mag_articoli").update(patch).eq("codice", a.codice);
        setSalvo(null);
        if (error) { alert("Non è stato possibile salvare: " + error.message); return; }
        setRighe((p) => (p || []).map((x) => (x.codice === a.codice ? { ...x, ...patch } as Art : x)));
        setBozza((p) => { const n = { ...p }; delete n[a.codice]; return n; });
    };

    return (
        <div className="space-y-4">
            <div className="glass-panel rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">📦 Articoli</div>
                <p className="text-[12px] text-slate-500 leading-relaxed">
                    Qui si definisce cosa vede la cassa: il <b className="text-slate-400">prezzo di vendita</b> (senza, l&apos;articolo non
                    si può vendere), il <b className="text-slate-400">costo d&apos;acquisto</b> (senza, il margine resta ignoto) e se in
                    cassa quel prezzo <b className="text-slate-400">si può correggere</b>. Gli articoli arrivano dall&apos;export del
                    gestionale: in negozio si consultano soltanto.
                </p>
            </div>

            <div className="glass-panel rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, codice, barcode o marca…"
                        className="glass-input w-full text-sm pl-9" />
                </div>
                <button onClick={() => setSoloProblemi((x) => !x)}
                    className={cn("px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 shrink-0",
                        soloProblemi ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "bg-white/[0.03] border-white/10 text-slate-400")}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Da sistemare {conProblema > 0 && `(${conProblema})`}
                </button>
            </div>

            {righe === null ? (
                <div className="glass-panel rounded-2xl p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
            ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                    <div className="divide-y divide-white/5">
                        {visibili.map((a) => {
                            const guai = problemaDi(a);
                            const tocco = !!bozza[a.codice];
                            return (
                                <div key={a.codice} className="px-4 py-3">
                                    <div className="flex items-start gap-3 flex-wrap">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm text-white font-medium">{a.descrizione}</div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                {a.codice}{a.barcode ? ` · ${a.barcode}` : ""}{a.marca ? ` · ${a.marca}` : ""}
                                                {a.sottogruppo ? ` · ${a.sottogruppo}` : ""}
                                            </div>
                                            {guai && <div className="text-[11px] text-amber-300/90 font-semibold mt-1 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> {guai}</div>}
                                        </div>
                                        <label className="shrink-0">
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Costo</div>
                                            <input type="number" step="0.01" min="0" value={(val(a, "costo_ultimo") as number | null) ?? ""}
                                                onChange={(e) => cambia(a, "costo_ultimo", e.target.value === "" ? null : Number(e.target.value))}
                                                className="glass-input w-28 text-sm text-right" />
                                        </label>
                                        <label className="shrink-0">
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Prezzo *</div>
                                            <input type="number" step="0.01" min="0" value={(val(a, "prezzo") as number | null) ?? ""}
                                                onChange={(e) => cambia(a, "prezzo", e.target.value === "" ? null : Number(e.target.value))}
                                                className={cn("glass-input w-28 text-sm text-right", val(a, "prezzo") == null && "border-rose-500/50")} />
                                        </label>
                                        <button onClick={() => cambia(a, "prezzo_modificabile", !val(a, "prezzo_modificabile"))}
                                            title={val(a, "prezzo_modificabile") ? "In cassa il prezzo si può correggere" : "In cassa il prezzo è bloccato"}
                                            className={cn("px-3 py-2 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 shrink-0 self-end",
                                                val(a, "prezzo_modificabile")
                                                    ? "bg-white/[0.03] border-white/10 text-slate-400"
                                                    : "bg-indigo-500/15 border-indigo-500/40 text-indigo-200")}>
                                            {val(a, "prezzo_modificabile") ? <><Unlock className="w-3.5 h-3.5" /> modificabile</> : <><Lock className="w-3.5 h-3.5" /> bloccato</>}
                                        </button>
                                        {tocco && (
                                            <button onClick={() => salva(a)} disabled={salvo === a.codice}
                                                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shrink-0 self-end">
                                                {salvo === a.codice ? "…" : "Salva"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {visibili.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-slate-500">
                                {soloProblemi ? "Nessun articolo da sistemare 🎉" : "Nessun articolo trovato"}
                            </div>
                        )}
                    </div>
                    {(righe || []).filter((a) => a.attivo).length > visibili.length && (
                        <div className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-white/5">
                            Mostrati {visibili.length} — scrivi nella ricerca per restringere.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
