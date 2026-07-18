"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Copy } from "lucide-react";
import { notify, dbError } from "./toast";
import { effVisibleCost, type RoleCostRule } from "./rolecosts";

/* Sistema costi MENSILE: ogni mese registrato in cost_months è una "corsa".
   - Il mese PIÙ RECENTE è quello vivo: le voci-Risorsa mostrano i costi attuali dall'anagrafica.
   - All'inizializzazione di un mese nuovo, il mese che si chiude viene CONGELATO:
     le voci-Risorsa materializzano gli importi e i costi delle persone finiscono in user_month_costs.
   - I mesi passati restano consultabili e modificabili (le modifiche toccano solo quel mese). */

export function currentMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addMonths(key: string, delta: number): string {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(key: string): string {
    const [y, m] = key.split("-").map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function useCostMonths(): { months: string[]; reload: () => void } {
    const [months, setMonths] = useState<string[]>([]);
    const load = useCallback(() => {
        supabase
            .from("cost_months")
            .select("month")
            .order("month")
            .then(({ data }) => {
                setMonths(((data as { month: string }[]) || []).map((r) => r.month));
            });
    }, []);
    useEffect(() => {
        load();
    }, [load]);
    return { months, reload: load };
}

/* ------------------------------------------------------------------ */
/* Inizializzazione di un nuovo mese                                   */
/* ------------------------------------------------------------------ */
interface SnapUser {
    id: string;
    full_name: string;
    role: string | null;
    grade: string | null;
    weekly_hours: number | null;
    company_cost: number | null;
    costo_gara: number | null;
    status: string;
    user_stores?: { store_name: string }[];
}

export async function initializeMonth(newMonth: string, fromMonth: string | null, rules: RoleCostRule[], copy: boolean): Promise<boolean> {
    const { data: usersData, error: eu } = await supabase
        .from("app_users")
        .select("id,full_name,role,grade,weekly_hours,company_cost,costo_gara,status,user_stores(store_name)");
    if (dbError("Lettura anagrafica", eu)) return false;
    const users = (usersData as SnapUser[]) || [];
    const active = users.filter((u) => u.status === "attivo");

    if (fromMonth) {
        // 1) congela le voci-Risorsa del mese che si chiude (materializza gli importi correnti)
        for (const table of ["shared_costs", "other_costs", "store_cost_items"]) {
            const { data: rows, error } = await supabase.from(table).select("id,user_id").eq("month", fromMonth).not("user_id", "is", null);
            if (dbError(`Lettura risorse ${table}`, error)) return false;
            for (const r of (rows as { id: string; user_id: string }[]) || []) {
                const u = users.find((x) => x.id === r.user_id);
                if (!u) continue;
                const { error: e2 } = await supabase
                    .from(table)
                    .update({ amount_azienda: Number(u.company_cost) || 0, amount_visibile: effVisibleCost(u, rules).value || 0 })
                    .eq("id", r.id);
                if (dbError("Congelamento risorsa", e2)) return false;
            }
        }
        // 2) snapshot dei costi delle persone per il mese che si chiude
        const snap = active.map((u) => ({
            month: fromMonth,
            user_id: u.id,
            full_name: u.full_name,
            role: u.role,
            store_names: (u.user_stores || []).map((s) => s.store_name),
            company_cost: u.company_cost != null ? Number(u.company_cost) : null,
            visible_cost: effVisibleCost(u, rules).value,
        }));
        if (snap.length) {
            const { error } = await supabase.from("user_month_costs").upsert(snap, { onConflict: "month,user_id" });
            if (dbError("Snapshot costi persone", error)) return false;
        }
        // 3) copia le voci nel mese nuovo (partendo "dando per scontato che sono quelli")
        if (copy) {
            const specs: [string, string][] = [
                ["shared_costs", "label,amount_azienda,amount_visibile,category_id,user_id"],
                ["other_costs", "label,amount_azienda,amount_visibile,category_id,user_id"],
                ["store_cost_items", "store_id,label,amount_azienda,amount_visibile,category_id,user_id,is_fixed"],
            ];
            for (const [table, cols] of specs) {
                const { data: rows, error } = await supabase.from(table).select(cols).eq("month", fromMonth);
                if (dbError(`Lettura ${table}`, error)) return false;
                const list = (rows as unknown as Record<string, unknown>[]) || [];
                if (list.length) {
                    const { error: e2 } = await supabase.from(table).insert(list.map((r) => ({ ...r, month: newMonth })));
                    if (dbError(`Copia ${table}`, e2)) return false;
                }
            }
        }
    }

    const { error: em } = await supabase.from("cost_months").insert({ month: newMonth });
    if (dbError("Registrazione mese", em)) return false;
    notify(`${monthLabel(newMonth)} inizializzato ✓`, "ok");
    return true;
}

/* ------------------------------------------------------------------ */
/* Barra del mese + banner di inizializzazione                         */
/* ------------------------------------------------------------------ */
export function MonthBar({
    month,
    setMonth,
    months,
}: {
    month: string;
    setMonth: (m: string) => void;
    months: string[];
}) {
    const earliest = months[0] || month;
    const latest = months[months.length - 1] || month;
    const maxMonth = addMonths(latest, 1); // si può navigare un mese oltre l'ultimo, per inizializzarlo
    const canPrev = month > earliest;
    const canNext = month < maxMonth;
    const isLatest = month === latest;

    return (
        <div className="glass-panel px-4 py-2.5 flex items-center gap-3">
            <CalendarDays className="w-4 h-4 text-indigo-400" />
            <button
                onClick={() => canPrev && setMonth(addMonths(month, -1))}
                disabled={!canPrev}
                className={cn("p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5", !canPrev && "opacity-30 cursor-not-allowed")}
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-white min-w-[130px] text-center">{monthLabel(month)}</span>
            <button
                onClick={() => canNext && setMonth(addMonths(month, 1))}
                disabled={!canNext}
                className={cn("p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5", !canNext && "opacity-30 cursor-not-allowed")}
            >
                <ChevronRight className="w-4 h-4" />
            </button>
            {months.includes(month) ? (
                isLatest ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">mese attivo</span>
                ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">storico · modificabile</span>
                )
            ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-white/10">da inizializzare</span>
            )}
            <span className="text-[11px] text-slate-600 ml-auto hidden sm:block">
                I costi sono mensili: cambia mese per vedere o correggere le corse passate.
            </span>
        </div>
    );
}

export function MonthInitBanner({
    month,
    months,
    rules,
    onDone,
}: {
    month: string;
    months: string[];
    rules: RoleCostRule[];
    onDone: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const latest = months[months.length - 1] || null;

    if (latest && month <= latest) {
        // mese passato mai inizializzato (buco): non dovrebbe capitare, ma non blocchiamo
        return <p className="text-sm text-slate-500 px-1">Nessun dato per {monthLabel(month)}.</p>;
    }

    const run = async (copy: boolean) => {
        if (busy) return;
        setBusy(true);
        const ok = await initializeMonth(month, latest, rules, copy);
        setBusy(false);
        if (ok) onDone();
    };

    return (
        <div className="glass-panel p-8 text-center space-y-4">
            <p className="text-white font-semibold text-lg">{monthLabel(month)} non è ancora inizializzato</p>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
                Inizializzandolo, {latest ? `i costi di ${monthLabel(latest)} vengono congelati (voci-Risorsa e costi delle persone) e ` : ""}
                parte la nuova corsa mensile. Le modifiche che farai apparterranno a {monthLabel(month)}.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
                {latest && (
                    <button onClick={() => run(true)} disabled={busy} className={cn("primary-btn flex items-center gap-2", busy && "opacity-40")}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        Inizializza copiando da {monthLabel(latest)}
                    </button>
                )}
                <button
                    onClick={() => run(false)}
                    disabled={busy}
                    className={cn("px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-sm border border-white/10", busy && "opacity-40")}
                >
                    Parti da zero
                </button>
            </div>
        </div>
    );
}
