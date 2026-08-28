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
/** PERMESSI PER PERSONA (MOD-29, Luca 10/08): righe role_permissions con
 *  chiave "user:<app_users.id>" = eccezioni del SINGOLO utente, che vincono
 *  su grado e ruolo. Ordine di fusione: ruolo → grado → utente. */
export const userKey = (userId: string) => `user:${userId}`;

export function useRolePermissions(role: string | null | undefined, grade?: string | null, userId?: string | null): { perms: PermMap | null; loaded: boolean } {
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
        const chiavi = [role];
        if (grade) chiavi.push(roleGradeKey(role, grade));
        if (userId) chiavi.push(userKey(userId));

        /* SE LA LETTURA NON RIESCE, SI RIPROVA (Luca 28/08).
           Prima bastava un singolo intoppo — il lasciapassare non ancora
           pronto, un attimo di rete — perché il CRM si arrendesse a una mappa
           vuota: e con la mappa vuota il pannello Permessi viene IGNORATO e
           valgono i valori di fabbrica del menù. Due facce, entrambe brutte:
           chi era stato abilitato a mano perdeva la sezione, e chi era stato
           tolto se la ritrovava. Ora si insiste tre volte prima di arrendersi,
           e la resa lascia una traccia in console. */
        const leggi = async (tentativo = 0): Promise<void> => {
            const { data, error } = await supabase.from("role_permissions")
                .select("role,perm_key,allowed").in("role", chiavi);
            if (!vivo) return;
            if (error) {
                if (tentativo < 2) {                       // 3 tentativi in tutto
                    await new Promise((r) => setTimeout(r, 400 * (tentativo + 1)));
                    if (!vivo) return;
                    return leggi(tentativo + 1);
                }
                console.warn("[permessi] non sono riuscito a leggere role_permissions:", error.message,
                    "— valgono i default del menù, le abilitazioni date dal pannello NON sono applicate.");
                setPerms(new Map());
                setLoaded(true);
                return;
            }
            const m: PermMap = new Map();
            const rows = (data ?? []) as { role: string; perm_key: string; allowed: boolean }[];
            // prima le righe di ruolo, poi le eccezioni di grado, poi
            // quelle della PERSONA — l'ultimo strato vince
            rows.filter((r) => r.role === role).forEach((r) => m.set(r.perm_key, r.allowed));
            if (grade) rows.filter((r) => r.role === roleGradeKey(role, grade)).forEach((r) => m.set(r.perm_key, r.allowed));
            if (userId) rows.filter((r) => r.role === userKey(userId)).forEach((r) => m.set(r.perm_key, r.allowed));
            setPerms(m);
            setLoaded(true);
        };
        void leggi();
        return () => { vivo = false; };
    }, [role, grade, userId]);

    return { perms, loaded };
}
