"use client";

/**
 * RUOLI (Amministrazione → Utenti → Ruoli) — vista dell'organigramma per ruolo:
 * per ciascun ruolo del CRM: area, gradi, quante persone lo ricoprono e chi
 * sono (espandibile). Primo passo del gruppo Utenti deciso da Luca il 25/07;
 * creazione/eliminazione di ruoli NUOVI = fase 2 (i ruoli oggi sono cablati in
 * roles.ts e agganciati a permessi, costi e gating: vanno migrati a DB prima).
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ROLES, areaLabel } from "@/lib/roles";
import { dbError } from "./toast";

interface Persona { id: string; full_name: string; role: string; grade: string | null; primary_store: string | null; active: boolean }

const AREA_COLORS: Record<string, string> = {
    pv: "#6366f1", cc: "#0ea5e9", ob: "#f59e0b", sede: "#a855f7",
};

export function RuoliView() {
    const [persone, setPersone] = useState<Persona[]>([]);
    const [aperto, setAperto] = useState<string | null>(null);
    const [soloAttivi, setSoloAttivi] = useState(true);

    useEffect(() => {
        supabase.from("app_users").select("id,full_name,role,grade,primary_store,active").order("full_name")
            .then(({ data, error }) => { if (error) dbError("utenti", error); else setPersone((data ?? []) as Persona[]); });
    }, []);

    const perRuolo = useMemo(() => {
        const m = new Map<string, Persona[]>();
        persone.filter((p) => !soloAttivi || p.active).forEach((p) => {
            (m.get(p.role) ?? m.set(p.role, []).get(p.role)!).push(p);
        });
        return m;
    }, [persone, soloAttivi]);

    const gradeLabelOf = (roleId: string, gradeId: string | null) => {
        if (!gradeId) return null;
        const r = ROLES.find((x) => x.id === roleId);
        return r?.grades.find((g) => g.id === gradeId)?.label || gradeId;
    };

    return (
        <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-slate-400">
                    I ruoli dell&apos;azienda con gradi e persone assegnate. La creazione di ruoli nuovi arriverà in una fase successiva
                    (oggi i ruoli sono agganciati a permessi, costi e gare).
                </p>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input type="checkbox" checked={soloAttivi} onChange={(e) => setSoloAttivi(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
                    Solo persone attive
                </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {ROLES.map((r) => {
                    const gente = perRuolo.get(r.id) ?? [];
                    const open = aperto === r.id;
                    const col = AREA_COLORS[r.area] || "#64748b";
                    return (
                        <div key={r.id} className="rounded-xl bg-white/[0.02] border border-white/8 overflow-hidden">
                            <button onClick={() => setAperto(open ? null : r.id)} className="w-full text-left p-4 hover:bg-white/[0.03] transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-bold text-white">{r.label}</div>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full border" style={{ color: col, borderColor: col + "66", background: col + "1a" }}>
                                        {areaLabel(r.area)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {r.grades.length > 0 ? r.grades.map((g) => (
                                        <span key={g.id} className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400">{g.label}</span>
                                    )) : <span className="text-[10px] text-slate-600">Nessun grado</span>}
                                </div>
                                <div className="text-xs text-slate-400 mt-2">
                                    <b className="text-slate-200">{gente.length}</b> person{gente.length === 1 ? "a" : "e"} {open ? "▾" : "▸"}
                                </div>
                            </button>
                            {open && (
                                <div className="border-t border-white/5 divide-y divide-white/5">
                                    {gente.length === 0 ? (
                                        <div className="px-4 py-3 text-xs text-slate-600">Nessuna persona con questo ruolo.</div>
                                    ) : gente.map((p) => (
                                        <div key={p.id} className="px-4 py-2 flex items-center gap-2 text-xs">
                                            <span className="font-medium text-slate-200">{p.full_name}</span>
                                            {!p.active && <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold">non attivo</span>}
                                            <span className="ml-auto text-slate-500">{gradeLabelOf(p.role, p.grade)}</span>
                                            {p.primary_store && <span className="text-slate-600">· {p.primary_store}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
