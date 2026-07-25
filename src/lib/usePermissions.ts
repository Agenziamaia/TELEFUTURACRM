"use client";

/**
 * Permessi di visibilita' per RUOLO (tabella role_permissions, mig. 086).
 * Hook client: carica le righe del ruolo una volta; `loaded` evita di
 * bloccare/nascondere prima che i dati arrivino. admin/dev non caricano nulla
 * (vedono sempre tutto). Se la tabella non esiste ancora, perms resta vuota e
 * valgono i default di codice: il CRM non si rompe mai per un permesso.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PermMap } from "@/lib/nav";

export function useRolePermissions(role: string | null | undefined): { perms: PermMap | null; loaded: boolean } {
    const [perms, setPerms] = useState<PermMap | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!role || role === "admin" || role === "dev") {
            setPerms(new Map());
            setLoaded(true);
            return;
        }
        let vivo = true;
        setLoaded(false);
        supabase.from("role_permissions").select("perm_key,allowed").eq("role", role)
            .then(({ data, error }) => {
                if (!vivo) return;
                const m: PermMap = new Map();
                if (!error) (data ?? []).forEach((r: { perm_key: string; allowed: boolean }) => m.set(r.perm_key, r.allowed));
                setPerms(m);
                setLoaded(true);
            });
        return () => { vivo = false; };
    }, [role]);

    return { perms, loaded };
}
