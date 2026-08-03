"use client";

/**
 * Permessi di visibilita' per RUOLO (tabella role_permissions, mig. 086).
 * Hook client: carica le righe del ruolo una volta; `loaded` evita di
 * bloccare/nascondere prima che i dati arrivino. admin/dev non caricano nulla
 * (vedono sempre tutto). Se la tabella non esiste ancora, perms resta vuota e
 * valgono i default di codice: il CRM non si rompe mai per un permesso.
 *
 * GRADI (Luca 03/08): una riga con role "ruolo@grado" e' un'ECCEZIONE che
 * vince sulla riga di ruolo per chi ha quel grado. Passando `grade` l'hook
 * carica e fonde le due serie (prima il ruolo, poi il grado sopra): tutti i
 * consumatori — sidebar, blocco rotte, capacita' — la rispettano da soli.
 * Senza grade (o senza righe @grado) NIENTE cambia: vale il ruolo intero.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PermMap } from "@/lib/nav";

/** chiave role delle eccezioni di grado in role_permissions */
export const roleGradeKey = (role: string, grade: string) => `${role}@${grade}`;

export function useRolePermissions(role: string | null | undefined, grade?: string | null): { perms: PermMap | null; loaded: boolean } {
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
        const chiavi = grade ? [role, roleGradeKey(role, grade)] : [role];
        supabase.from("role_permissions").select("role,perm_key,allowed").in("role", chiavi)
            .then(({ data, error }) => {
                if (!vivo) return;
                const m: PermMap = new Map();
                if (!error) {
                    const rows = (data ?? []) as { role: string; perm_key: string; allowed: boolean }[];
                    // prima le righe di ruolo, poi le eccezioni di grado SOPRA
                    rows.filter((r) => r.role === role).forEach((r) => m.set(r.perm_key, r.allowed));
                    if (grade) rows.filter((r) => r.role === roleGradeKey(role, grade)).forEach((r) => m.set(r.perm_key, r.allowed));
                }
                setPerms(m);
                setLoaded(true);
            });
        return () => { vivo = false; };
    }, [role, grade]);

    return { perms, loaded };
}
