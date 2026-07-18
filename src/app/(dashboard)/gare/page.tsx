"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import Image from "next/image";
import {
    Trophy,
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
    Plus,
    Trash2,
    Loader2,
    Copy,
} from "lucide-react";
import { ToastHost, notify, dbError } from "../amministrazione/_views/toast";
import { MoneyInput } from "../amministrazione/_views/money";
import { addMonths, monthLabel, currentMonthKey } from "../amministrazione/_views/months";

/* GARE — soglie degli operatori e commissioning collegato, per brand e per mese.
   Ogni brand è una sotto-sezione; le condizioni cambiano mese su mese e lo storico resta consultabile. */

// Loghi e colori come in Registra Contratto (stessa rappresentazione)
const GARE_BRANDS = [
    { id: "w3", label: "WindTre", desc: "Soglie e commissioning dei franchising Wind3.", color: "#FF6B00", logo: "/windtre.png" },
    { id: "vs", label: "Vodafone Store", desc: "Soglie e commissioning dei Vodafone Store.", color: "#E60000", logo: "/vodaphone - Copy.png" },
    { id: "vnd", label: "Vodafone VND", desc: "Target Vodafone dei negozi multi brand (gestione VND).", color: "#E60000", logo: "/vodaphone - Copy.png" },
    { id: "fastweb", label: "Fastweb", desc: "Target Fastweb dei multi brand (nessun franchising).", color: "#CC9900", logo: "/fastweb.png" },
    { id: "sky", label: "Sky", desc: "Soglie e commissioning Sky.", color: "#0072C6", logo: "/sky.png" },
    { id: "s4", label: "S4 Energy", desc: "Soglie e commissioning energia S4.", color: "#28a745", logo: "/energy - Copy.png" },
    { id: "tim", label: "TIM", desc: "Soglie e commissioning Tim.", color: "#0050FF", logo: "/tim-logo.png" },
    { id: "dojo", label: "Dojo", desc: "Soglie e commissioning POS Dojo.", color: "#14b8a6", logo: "/dojo - Copy.png" },
] as const;

interface Soglia {
    id: string;
    name: string;
    threshold: number | null;
    payout: number | null;
    payout_type: string;
    notes: string | null;
}

export default function GarePage() {
    return (
        <Suspense>
            <GareInner />
        </Suspense>
    );
}

function GareInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const brandId = searchParams.get("brand");
    const brand = GARE_BRANDS.find((b) => b.id === brandId);
    const go = (b?: string) => router.push(b ? `/gare?brand=${b}` : "/gare");
    const [month, setMonth] = useState(currentMonthKey());

    return (
        <div className="space-y-6">
            <ToastHost />
            {/* Header */}
            <div>
                {brand && (
                    <button onClick={() => go()} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-1">
                        <ArrowLeft className="w-3.5 h-3.5" /> Gare
                    </button>
                )}
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    {brand ? (
                        <>
                            <Image src={brand.logo} alt={brand.label} width={140} height={40} className="h-9 w-auto object-contain" />
                            <span>
                                Gare · <span style={{ color: brand.color }}>{brand.label}</span>
                            </span>
                        </>
                    ) : (
                        <>
                            <Trophy className="w-6 h-6 text-amber-400" /> Gare
                        </>
                    )}
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    {brand ? brand.desc : "Le soglie che gli operatori ci danno e il commissioning collegato, brand per brand, mese per mese."}
                </p>
            </div>

            {!brand ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {GARE_BRANDS.map((b) => (
                        <button
                            key={b.id}
                            onClick={() => go(b.id)}
                            className="p-4 rounded-xl border-2 border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-center"
                        >
                            <div className="flex items-center justify-center h-14 mb-3">
                                <Image src={b.logo} alt={b.label} width={180} height={56} className="h-14 w-auto max-w-[85%] object-contain" />
                            </div>
                            <p className="font-extrabold text-[15px]" style={{ color: b.color }}>
                                {b.label}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{b.desc}</p>
                        </button>
                    ))}
                </div>
            ) : (
                <>
                    {/* Barra mese */}
                    <div className="glass-panel px-4 py-2.5 flex items-center gap-3">
                        <CalendarDays className="w-4 h-4 text-indigo-400" />
                        <button onClick={() => setMonth(addMonths(month, -1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-semibold text-white min-w-[130px] text-center">{monthLabel(month)}</span>
                        <button onClick={() => setMonth(addMonths(month, 1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        {month === currentMonthKey() && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">mese corrente</span>
                        )}
                        <span className="text-[11px] text-slate-600 ml-auto hidden sm:block">Le condizioni cambiano mese su mese: naviga per vedere o correggere.</span>
                    </div>

                    <SoglieView key={`${brand.id}|${month}`} brand={brand.id} month={month} accent={brand.color} />
                </>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Soglie di un brand in un mese                                       */
/* ------------------------------------------------------------------ */
function SoglieView({ brand, month, accent }: { brand: string; month: string; accent: string }) {
    const [rows, setRows] = useState<Soglia[]>([]);
    const [loading, setLoading] = useState(true);
    const [prevCount, setPrevCount] = useState(0);
    const [copying, setCopying] = useState(false);
    const [confirmDel, setConfirmDel] = useState<string | null>(null);
    // form nuova soglia
    const [nName, setNName] = useState("");
    const [nThr, setNThr] = useState("");
    const [nPay, setNPay] = useState<number | null>(null);
    const [nType, setNType] = useState("fisso");
    const [nNotes, setNNotes] = useState("");

    const prevMonth = addMonths(month, -1);

    const load = useCallback(async () => {
        setLoading(true);
        const [cur, prev] = await Promise.all([
            supabase.from("brand_soglie").select("id,name,threshold,payout,payout_type,notes").eq("brand", brand).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("brand_soglie").select("id").eq("brand", brand).eq("month", prevMonth),
        ]);
        if (!dbError("Caricamento soglie", cur.error)) setRows((cur.data as Soglia[]) || []);
        setPrevCount(((prev.data as { id: string }[]) || []).length);
        setLoading(false);
    }, [brand, month, prevMonth]);
    useEffect(() => {
        load();
    }, [load]);

    const copyFromPrev = async () => {
        if (copying) return;
        setCopying(true);
        const { data, error } = await supabase
            .from("brand_soglie")
            .select("name,threshold,payout,payout_type,notes,sort_order")
            .eq("brand", brand)
            .eq("month", prevMonth);
        if (!dbError("Lettura mese precedente", error) && data?.length) {
            const { error: e2 } = await supabase.from("brand_soglie").insert((data as Record<string, unknown>[]).map((r) => ({ ...r, brand, month })));
            if (!dbError("Copia soglie", e2)) {
                notify(`Copiate ${data.length} soglie da ${monthLabel(prevMonth)} ✓`, "ok");
                load();
            }
        }
        setCopying(false);
    };

    const add = async () => {
        if (!nName.trim()) {
            notify("Dai un nome alla soglia (es. Fissi, Mobile, SIM)");
            return;
        }
        const { error } = await supabase.from("brand_soglie").insert({
            brand,
            month,
            name: nName.trim(),
            threshold: nThr ? Number(nThr) : null,
            payout: nPay,
            payout_type: nType,
            notes: nNotes.trim() || null,
            sort_order: rows.length,
        });
        if (dbError("Creazione soglia", error)) return;
        notify("Soglia aggiunta ✓", "ok");
        setNName("");
        setNThr("");
        setNPay(null);
        setNType("fisso");
        setNNotes("");
        load();
    };

    const upd = (id: string, patch: Partial<Soglia>) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const save = async (r: Soglia) => {
        const { error } = await supabase
            .from("brand_soglie")
            .update({ name: r.name, threshold: r.threshold, payout: r.payout, payout_type: r.payout_type, notes: r.notes })
            .eq("id", r.id);
        dbError("Salvataggio soglia", error);
    };
    const del = async (id: string) => {
        const { error } = await supabase.from("brand_soglie").delete().eq("id", id);
        if (!dbError("Eliminazione soglia", error)) load();
        setConfirmDel(null);
    };

    if (loading)
        return (
            <div className="flex justify-center py-16 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );

    const fissi = rows.filter((r) => r.payout_type === "fisso").reduce((a, r) => a + (Number(r.payout) || 0), 0);
    const perPezzo = rows.filter((r) => r.payout_type === "per_pezzo").length;
    const money = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-4">
            {/* copia dal mese precedente quando il mese è vuoto */}
            {!rows.length && prevCount > 0 && (
                <div className="glass-panel p-5 text-center space-y-3">
                    <p className="text-sm text-slate-400">
                        Nessuna soglia per {monthLabel(month)}. Il mese precedente ne ha <span className="text-white font-medium">{prevCount}</span>.
                    </p>
                    <button onClick={copyFromPrev} disabled={copying} className={cn("primary-btn flex items-center gap-2 mx-auto", copying && "opacity-40")}>
                        {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        Copia le soglie di {monthLabel(prevMonth)}
                    </button>
                    <p className="text-[11px] text-slate-600">oppure aggiungile da zero qui sotto</p>
                </div>
            )}

            {/* intestazione colonne */}
            {rows.length > 0 && (
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Soglie · {rows.length}</span>
                    <span className="text-[11px] text-slate-500">
                        Bonus fissi potenziali: <span style={{ color: accent }}>{money(fissi)}</span>
                        {perPezzo > 0 && <span className="text-slate-600"> + {perPezzo} a pezzo</span>}
                    </span>
                </div>
            )}

            <div className="space-y-1.5">
                {rows.map((r) => (
                    <div key={r.id} className="glass-card p-2.5 rounded-lg flex flex-wrap items-center gap-2">
                        <input
                            value={r.name}
                            onChange={(e) => upd(r.id, { name: e.target.value })}
                            onBlur={() => save(r)}
                            className="glass-input flex-1 min-w-[140px] py-1 text-sm font-medium"
                            placeholder="Nome soglia"
                        />
                        <span className="text-[10px] text-slate-600">soglia</span>
                        <input
                            type="number"
                            step="1"
                            value={r.threshold ?? ""}
                            onChange={(e) => upd(r.id, { threshold: e.target.value ? Number(e.target.value) : null })}
                            onBlur={() => save(r)}
                            placeholder="—"
                            className="glass-input w-24 py-1 text-sm text-center"
                            title="Soglia richiesta (pezzi)"
                        />
                        <MoneyInput
                            value={r.payout}
                            onChange={(v) => upd(r.id, { payout: v })}
                            onCommit={() => save(r)}
                            wrapClass="w-28"
                            className="py-1 text-sm"
                            title="Commissioning"
                        />
                        <select
                            value={r.payout_type}
                            onChange={(e) => {
                                upd(r.id, { payout_type: e.target.value });
                                save({ ...r, payout_type: e.target.value });
                            }}
                            className="glass-input w-auto py-1 text-xs"
                        >
                            <option value="fisso">€ una tantum</option>
                            <option value="per_pezzo">€ a pezzo</option>
                        </select>
                        <input
                            value={r.notes ?? ""}
                            onChange={(e) => upd(r.id, { notes: e.target.value || null })}
                            onBlur={() => save(r)}
                            placeholder="note…"
                            className="glass-input flex-1 min-w-[120px] py-1 text-xs text-slate-400"
                        />
                        {confirmDel === r.id ? (
                            <span className="flex items-center gap-1">
                                <button onClick={() => del(r.id)} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina</button>
                                <button onClick={() => setConfirmDel(null)} className="text-[10px] text-slate-500 px-1">Annulla</button>
                            </span>
                        ) : (
                            <button onClick={() => setConfirmDel(r.id)} className="text-slate-500 hover:text-rose-400 p-1">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
                {!rows.length && prevCount === 0 && (
                    <p className="text-xs text-slate-600 px-1">Nessuna soglia per questo mese. Aggiungi la prima qui sotto.</p>
                )}
            </div>

            {/* nuova soglia */}
            <div className="glass-card p-3 rounded-xl space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Plus className="w-3 h-3" /> Nuova soglia
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Nome (es. Fissi, Mobile, SIM)" className="glass-input flex-1 min-w-[150px] py-1.5 text-sm" />
                    <input type="number" step="1" value={nThr} onChange={(e) => setNThr(e.target.value)} placeholder="soglia" className="glass-input w-24 py-1.5 text-sm text-center" />
                    <MoneyInput value={nPay} onChange={setNPay} wrapClass="w-28" className="py-1.5 text-sm" placeholder="comm." />
                    <select value={nType} onChange={(e) => setNType(e.target.value)} className="glass-input w-auto py-1.5 text-xs">
                        <option value="fisso">€ una tantum</option>
                        <option value="per_pezzo">€ a pezzo</option>
                    </select>
                    <input value={nNotes} onChange={(e) => setNNotes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="note (opzionale)" className="glass-input flex-1 min-w-[120px] py-1.5 text-xs" />
                    <button onClick={add} className="primary-btn text-sm px-3 py-1.5">Aggiungi</button>
                </div>
            </div>
        </div>
    );
}

