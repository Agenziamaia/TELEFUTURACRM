"use client";

// DESTINATARI ESTESI delle comunicazioni (Luca 31/07, mig. 112): oltre ai
// RUOLI si puo' mirare a NEGOZI (chi ha quel negozio come sede), PERSONE
// singole e BRAND (chi sta in un negozio che tratta quel brand — colonna
// stores.brands, da compilare in Amministrazione). Nessun target = per tutti.
// Basta UNA corrispondenza qualsiasi per essere destinatari.
import { supabase } from "@/lib/supabaseClient";
import { sameStore } from "@/lib/visibleStores";

export type TargetEstesi = {
    target_roles: string[] | null;
    target_stores?: string[] | null;
    target_users?: string[] | null;
    target_brands?: string[] | null;
    created_by?: string | null;
};

export function comunicazionePerMe(
    c: TargetEstesi,
    io: { userId?: string | null; role?: string | null; negozio?: string | null; brandsNegozio?: string[] },
): boolean {
    // l'AUTORE non e' mai destinatario della propria comunicazione (Luca 31/07):
    // niente popup, niente conferma, non compare tra le ricevute attese
    if (c.created_by && io.userId && c.created_by === io.userId) return false;
    const haTarget = !!(c.target_roles?.length || c.target_stores?.length || c.target_users?.length || c.target_brands?.length);
    if (!haTarget) return true;
    if (c.target_roles?.length && io.role && c.target_roles.includes(io.role)) return true;
    if (c.target_users?.length && io.userId && c.target_users.includes(io.userId)) return true;
    if (c.target_stores?.length && io.negozio && c.target_stores.some((s) => sameStore(s, io.negozio))) return true;
    if (c.target_brands?.length && io.brandsNegozio?.length && c.target_brands.some((b) => io.brandsNegozio!.includes(b))) return true;
    return false;
}

/** Brand trattati dal negozio dell'utente (stores.brands, mig. 112);
 *  torna [] se il negozio manca o la migrazione non e' ancora applicata. */
export async function brandDelNegozio(negozio: string | null | undefined): Promise<string[]> {
    if (!negozio) return [];
    try {
        const { data, error } = await supabase.from("stores").select("name, brands");
        if (error) return [];
        const hit = ((data ?? []) as { name: string | null; brands?: string[] | null }[])
            .find((s) => sameStore(s.name, negozio));
        return Array.isArray(hit?.brands) ? hit!.brands! : [];
    } catch { return []; }
}
