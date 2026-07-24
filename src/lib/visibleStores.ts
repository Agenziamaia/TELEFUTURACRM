"use client";

/**
 * VISIBILITÀ NEGOZI — fonte unica per TUTTO il CRM.
 *
 * L'admin decide da Amministrazione quali negozi un utente vede:
 *   - user_stores            = negozi ASSEGNATI (dove lavora / attribuzione costi)
 *   - user_store_visibility  = negozi IN VISIBILITÀ (vede i dati senza esservi assegnato)
 *   - primary_store          = negozio del login (user.negozio)
 *
 * L'ambito visibile e' l'UNIONE dei tre. Prima ogni pagina si arrangiava da sola
 * (ricerca bloccava sul solo primary_store, calendario/collaboratori leggevano solo
 * user_stores, tracking/dashboard avevano la copia giusta duplicata): Emanuele con
 * visibilita' su Magliana W3 + Magliana Multi vedeva solo il Multi in ricerca.
 * OGNI sezione che filtra per negozio deve passare da questo hook.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { seesAllStores } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";

/** Confronto tollerante tra nomi negozio: esatto o per prefisso, perche' i dati
 *  storici usano anche la radice corta ("Magliana" vs "Magliana Multi"). */
export function sameStore(a?: string | null, b?: string | null): boolean {
    const x = String(a || "").trim().toLowerCase();
    const y = String(b || "").trim().toLowerCase();
    return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
}

/** Valori per un filtro query `.in("negozio", …)`: i nomi visibili piu' le radici
 *  legacy dei nomi composti (visibile "Magliana W3" ⇒ anche i contratti storici
 *  salvati come "Magliana"). Piu' preciso del vecchio ilike sulla radice, che a
 *  chi vedeva un solo Magliana mostrava anche l'altro. */
export function negozioInValues(stores: string[]): string[] {
    const out = new Set<string>();
    stores.forEach((s) => {
        const t = String(s || "").trim();
        if (!t) return;
        out.add(t);
        const root = t.split(" ")[0];
        if (root && root !== t) out.add(root);
    });
    return [...out];
}

export interface VisibleStores {
    /** true per i ruoli a visibilita' globale (seesAllStores): nessun filtro. */
    seesAll: boolean;
    /** Negozi visibili (vuoto se seesAll o se l'utente non ha negozi). */
    stores: string[];
    /** false finche' la lista non e' arrivata: NON interrogare i dati prima,
     *  altrimenti il primo fetch parte senza filtro o col solo primary_store. */
    loaded: boolean;
}

export function useVisibleStores(): VisibleStores {
    const { user } = useAuth();
    const seesAll = seesAllStores(user?.role);
    const [stores, setStores] = useState<string[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!user?.id || seesAll) {
            setStores([]);
            setLoaded(true);
            return;
        }
        let vivo = true;
        setLoaded(false);
        (async () => {
            const [us, vis] = await Promise.all([
                supabase.from("user_stores").select("store_name").eq("user_id", user.id),
                supabase.from("user_store_visibility").select("store_name").eq("user_id", user.id),
            ]);
            if (!vivo) return;
            const set = new Set<string>();
            if (user.negozio) set.add(user.negozio);
            (us.data ?? []).forEach((r: { store_name?: string | null }) => { if (r.store_name) set.add(String(r.store_name)); });
            (vis.data ?? []).forEach((r: { store_name?: string | null }) => { if (r.store_name) set.add(String(r.store_name)); });
            setStores([...set].sort());
            setLoaded(true);
        })();
        return () => { vivo = false; };
    }, [user?.id, user?.negozio, seesAll]);

    return { seesAll, stores, loaded };
}
