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
import { useAuth } from "@/context/AuthContext";

/* Le regole sui NOMI dei negozi vivono in `negoziNomi.ts`, che non è un modulo
   client e quindi è usabile anche dal server (vedi `visibleStoresServer.ts`).
   Si ri-esportano da qui perché mezzo CRM le importa già da questo file. */
export {
    sameStore, splitNegozi, matchNegozi, sedeFisica, stessoMagazzino, negozioInValues,
} from "@/lib/negoziNomi";

export interface VisibleStores {
    /** true = nessun filtro: admin/dev/direttore_generale sempre; amministrativo
     *  solo finche' l'admin non gli restringe la visibilita' (righe esplicite). */
    seesAll: boolean;
    /** Negozi visibili (vuoto se seesAll o se l'utente non ha negozi). */
    stores: string[];
    /** false finche' la lista non e' arrivata: NON interrogare i dati prima,
     *  altrimenti il primo fetch parte senza filtro o col solo primary_store. */
    loaded: boolean;
}

export function useVisibleStores(): VisibleStores {
    const { user } = useAuth();
    // Visibilita' globale INCONDIZIONATA solo per admin/dev/direttore generale.
    // L'AMMINISTRATIVO vede tutti i negozi DI DEFAULT, ma l'admin puo' toglierne:
    // se ha righe esplicite in user_store_visibility, vale SOLO quella lista
    // (nessuna riga = default tutti). Regola decisa da Luca il 25/07.
    const roleAll = !!user && ["admin", "dev", "direttore_generale"].includes(user.role);
    const isAmministrativo = user?.role === "amministrativo";
    const [state, setState] = useState<{ seesAll: boolean; stores: string[]; loaded: boolean }>(
        { seesAll: roleAll, stores: [], loaded: false },
    );

    useEffect(() => {
        if (!user?.id) {
            setState({ seesAll: false, stores: [], loaded: false });
            return;
        }
        if (roleAll) {
            setState({ seesAll: true, stores: [], loaded: true });
            return;
        }
        let vivo = true;
        setState((p) => ({ ...p, loaded: false }));
        (async () => {
            const [us, vis] = await Promise.all([
                supabase.from("user_stores").select("store_name").eq("user_id", user.id),
                supabase.from("user_store_visibility").select("store_name").eq("user_id", user.id),
            ]);
            if (!vivo) return;
            const visRows = (vis.data ?? []).map((r: { store_name?: string | null }) => String(r.store_name || "")).filter(Boolean);
            if (isAmministrativo && visRows.length === 0) {
                // amministrativo senza restrizioni esplicite: tutti i negozi
                setState({ seesAll: true, stores: [], loaded: true });
                return;
            }
            const set = new Set<string>();
            if (user.negozio) set.add(user.negozio);
            (us.data ?? []).forEach((r: { store_name?: string | null }) => { if (r.store_name) set.add(String(r.store_name)); });
            visRows.forEach((n) => set.add(n));
            setState({ seesAll: false, stores: [...set].sort(), loaded: true });
        })();
        return () => { vivo = false; };
    }, [user?.id, user?.negozio, roleAll, isAmministrativo]);

    return state;
}
