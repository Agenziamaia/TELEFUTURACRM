"use client";

/**
 * RUOLI FUSI codice + database (tabella role_defs, mig. 087).
 *
 * - I ruoli di SISTEMA vivono in roles.ts (portano permessi, costi, gating);
 *   una riga role_defs con lo stesso id fa da OVERRIDE di etichetta/area/gradi.
 * - I ruoli PERSONALIZZATI (is_custom) esistono solo a DB e si aggiungono in coda.
 * - Se la tabella manca o e' vuota vale il codice: il CRM non si rompe mai.
 *
 * Chi mostra/assegna ruoli deve usare QUESTO hook, non ROLES direttamente,
 * altrimenti i ruoli creati dall'admin non compaiono.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ROLES, type Area, type Grade } from "@/lib/roles";

export interface RoleDefRow {
    id: string;
    label: string;
    area: Area;
    grades: Grade[];
    is_custom: boolean;
}

export interface RoleMerged {
    id: string;
    label: string;
    area: Area;
    grades: Grade[];
    isCustom: boolean;
    hasOverride: boolean;   // ruolo di sistema con riga override a DB
}

// cache di modulo: tanti componenti montati, UN solo fetch (e reload condiviso)
let _rows: RoleDefRow[] = [];
let _loaded = false;
let _inflight: Promise<void> | null = null;
const _subs = new Set<() => void>();
async function fetchRows(force = false): Promise<void> {
    if (_loaded && !force) return;
    if (_inflight && !force) return _inflight;
    _inflight = (async () => {
        const { data, error } = await supabase.from("role_defs").select("id,label,area,grades,is_custom");
        if (!error) _rows = ((data ?? []) as RoleDefRow[]).map((r) => ({ ...r, grades: Array.isArray(r.grades) ? r.grades : [] }));
        _loaded = true;
        _inflight = null;
        _subs.forEach((fn) => fn());
    })();
    return _inflight;
}

export function useRoles() {
    const [, bump] = useState(0);
    const rows = _rows;
    const loaded = _loaded;

    const reload = useCallback(async () => { await fetchRows(true); }, []);
    useEffect(() => {
        const fn = () => bump((v) => v + 1);
        _subs.add(fn);
        fetchRows();
        return () => { _subs.delete(fn); };
    }, []);

    const roles: RoleMerged[] = useMemo(() => {
        const byId = new Map(rows.map((r) => [r.id, r]));
        const out: RoleMerged[] = ROLES.map((r) => {
            const ov = byId.get(r.id);
            return ov
                ? { id: r.id, label: ov.label, area: ov.area, grades: ov.grades.length ? ov.grades : r.grades, isCustom: false, hasOverride: true }
                : { id: r.id, label: r.label, area: r.area, grades: r.grades, isCustom: false, hasOverride: false };
        });
        rows.filter((r) => r.is_custom && !ROLES.some((x) => x.id === r.id))
            .forEach((r) => out.push({ id: r.id, label: r.label, area: r.area, grades: r.grades, isCustom: true, hasOverride: false }));
        return out;
    }, [rows]);

    const labelOf = useCallback((id: string) => roles.find((r) => r.id === id)?.label || id, [roles]);
    const gradesOf = useCallback((id: string) => roles.find((r) => r.id === id)?.grades ?? [], [roles]);

    return { roles, labelOf, gradesOf, reload, loaded };
}
