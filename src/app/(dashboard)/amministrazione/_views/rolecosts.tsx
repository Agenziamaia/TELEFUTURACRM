"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { ROLES, AREAS } from "@/lib/roles";
import { X, Loader2, Save, Euro } from "lucide-react";
import { notify, dbError } from "./toast";
import { MoneyInput } from "./money";

/* Regole di costo VISIBILE per ruolo+grado, salvate a DB (tabella role_costs).
   grade '' = ruolo senza gradi. unit 'mese' = importo mensile; unit 'ora' = €/h,
   trasformato in mensile con le ore settimanali dell'utente (× 52 ÷ 12).
   PRECEDENZA: il costo impostato sulla singola persona (costo_gara) vince sulla regola. */

export interface RoleCostRule {
    role: string;
    grade: string;
    unit: string;
    value: number | null;
}

export function useRoleCosts(): RoleCostRule[] {
    const [rules, setRules] = useState<RoleCostRule[]>([]);
    useEffect(() => {
        let on = true;
        supabase
            .from("role_costs")
            .select("role,grade,unit,value")
            .then(({ data }) => {
                if (on) setRules((data as RoleCostRule[]) || []);
            });
        return () => {
            on = false;
        };
    }, []);
    return rules;
}

// Costo visibile efficace di una persona: override personale > regola ruolo/grado.
export function effVisibleCost(
    u: { role?: string | null; grade?: string | null; weekly_hours?: number | null; costo_gara?: number | null },
    rules: RoleCostRule[],
): { value: number | null; fromRule: boolean } {
    if (u.costo_gara != null) return { value: Number(u.costo_gara), fromRule: false };
    const r = rules.find((x) => x.role === u.role && x.grade === (u.grade || ""));
    if (!r || r.value == null) return { value: null, fromRule: false };
    if (r.unit === "ora") {
        if (!u.weekly_hours) return { value: null, fromRule: false };
        return { value: Math.round(((Number(r.value) * u.weekly_hours * 52) / 12) * 100) / 100, fromRule: true };
    }
    return { value: Number(r.value), fromRule: true };
}

/* ------------------------------------------------------------------ */
/* Modale di gestione regole (bottone "Costi ruoli" in Utenti)         */
/* ------------------------------------------------------------------ */
interface ComboRow {
    role: string;
    grade: string;
    label: string;
    area: string;
}

export function RoleCostsModal({ onClose }: { onClose: () => void }) {
    // L'area Outbound è esclusa: agenti a P.IVA e direzione hanno costi DINAMICI legati
    // alla produzione (solo costo azienda: agenti = fatturato, direttore = 20% del fatturato agenti).
    // Non impattano i negozi, quindi niente costo visibile.
    const combos: ComboRow[] = useMemo(
        () =>
            ROLES.filter((r) => r.area !== "ob").flatMap((r) =>
                r.grades.length
                    ? r.grades.map((g) => ({ role: r.id, grade: g.id, label: `${r.label} — ${g.label}`, area: r.area }))
                    : [{ role: r.id, grade: "", label: r.label, area: r.area }],
            ),
        [],
    );
    const key = (c: { role: string; grade: string }) => `${c.role}|${c.grade}`;

    const [saved, setSaved] = useState<Record<string, { value: number | null; unit: string }>>({});
    const [edit, setEdit] = useState<Record<string, { value: number | null; unit: string }>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let on = true;
        supabase
            .from("role_costs")
            .select("role,grade,unit,value")
            .then(({ data, error }) => {
                if (!on) return;
                if (!dbError("Caricamento regole costi", error)) {
                    const map: Record<string, { value: number | null; unit: string }> = {};
                    for (const r of (data as RoleCostRule[]) || []) map[`${r.role}|${r.grade}`] = { value: r.value != null ? Number(r.value) : null, unit: r.unit };
                    setSaved(map);
                    setEdit(map);
                }
                setLoading(false);
            });
        return () => {
            on = false;
        };
    }, []);

    const rowOf = (k: string) => edit[k] || { value: null, unit: "mese" };
    const setRow = (k: string, patch: Partial<{ value: number | null; unit: string }>) =>
        setEdit((p) => ({ ...p, [k]: { ...(p[k] || { value: null, unit: "mese" }), ...patch } }));

    const dirty = useMemo(
        () => combos.some((c) => {
            const a = rowOf(key(c));
            const b = saved[key(c)] || { value: null, unit: "mese" };
            return a.value !== b.value || (a.value != null && a.unit !== b.unit);
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [edit, saved, combos],
    );

    const save = async () => {
        if (saving) return;
        setSaving(true);
        const rows = combos
            .filter((c) => {
                const a = rowOf(key(c));
                const b = saved[key(c)] || { value: null, unit: "mese" };
                return a.value !== b.value || (a.value != null && a.unit !== b.unit);
            })
            .map((c) => ({ role: c.role, grade: c.grade, unit: rowOf(key(c)).unit, value: rowOf(key(c)).value }));
        if (rows.length) {
            const { error } = await supabase.from("role_costs").upsert(rows, { onConflict: "role,grade" });
            if (!dbError("Salvataggio regole", error)) {
                setSaved((p) => {
                    const n = { ...p };
                    for (const r of rows) n[`${r.role}|${r.grade}`] = { value: r.value, unit: r.unit };
                    return n;
                });
                notify(`Regole salvate (${rows.length}) ✓`, "ok");
            }
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#0f111a] border border-white/10 rounded-2xl">
                <div className="sticky top-0 bg-[#0f111a]/95 backdrop-blur-xl border-b border-white/10 p-4 flex items-center gap-2 z-10">
                    <Euro className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-white font-semibold">Costi visibili per ruolo e grado</h3>
                    {dirty && <span className="text-[10px] text-amber-400">● non salvato</span>}
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={save}
                            disabled={!dirty || saving}
                            className={cn("primary-btn text-sm px-4 flex items-center gap-2", (!dirty || saving) && "opacity-40 cursor-not-allowed")}
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="p-4 space-y-5">
                    <p className="text-xs text-slate-500">
                        Il valore <span className="text-slate-300">€/mese</span> si applica com&apos;è; il valore{" "}
                        <span className="text-slate-300">€/ora</span> diventa mensile con le ore settimanali della persona (× 52 ÷ 12).
                        Il costo impostato sulla <span className="text-slate-300">singola persona</span> vince sempre sulla regola.
                        L&apos;<span className="text-slate-300">Outbound</span> non è in tabella: agenti a P.IVA e direzione hanno
                        costi dinamici legati alla produzione (solo costo azienda, nessun costo visibile).
                    </p>
                    {loading ? (
                        <div className="flex justify-center py-10 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    ) : (
                        AREAS.map((a) => {
                            const rows = combos.filter((c) => c.area === a.id);
                            if (!rows.length) return null;
                            return (
                                <div key={a.id} className="space-y-1.5">
                                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{a.label}</h5>
                                    {rows.map((c) => {
                                        const k = key(c);
                                        const r = rowOf(k);
                                        return (
                                            <div key={k} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                                                <span className="flex-1 text-sm text-slate-200 truncate">{c.label}</span>
                                                <MoneyInput value={r.value} onChange={(v) => setRow(k, { value: v })} wrapClass="w-28" className="py-1 text-sm" />
                                                <select
                                                    value={r.unit}
                                                    onChange={(e) => setRow(k, { unit: e.target.value })}
                                                    className="glass-input w-auto py-1 text-xs"
                                                >
                                                    <option value="mese">€/mese</option>
                                                    <option value="ora">€/ora</option>
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
