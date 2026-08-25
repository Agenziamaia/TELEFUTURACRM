// VISIBILITÀ NUMERI WHATSAPP — regola UNICA, estratta da WhatsAppInbox
// (Sheekel 11/08: l'alert contava numeri che l'utente non poteva vedere).
// Modello "un numero per caller": ognuno vede i PROPRI numeri; lo store
// manager i numeri del suo negozio; SOLO Luca (id reale, non ruolo — deciso
// 28/07) ha la vista completa. Il badge deve contare ESATTAMENTE ciò che
// l'inbox mostra: stesse utenze, e solo quelle CONNESSE (l'inbox nasconde
// le chat delle disconnesse).
import { sameStore } from "@/lib/visibleStores";

export const WA_LUCA_ID = "0355d28b-968f-4089-93b7-b8b5eeeda40c";

export type WaScope = "all" | "store" | "own";

export function waScopeDi(userId?: string | null, role?: string | null): WaScope {
    if (userId === WA_LUCA_ID) return "all";
    if (role === "store_manager") return "store";
    return "own";
}

/** BADGE della voce Chat (Luca 11/08, round 3): il pallino conta SOLO il
 *  numero PERSONALE (owner) — chi ha visibilità completa (Luca) o di negozio
 *  non deve vedere notifiche di chat che non sono le sue. Nessun numero
 *  configurato = nessun pallino. Solo utenze connesse. Le notifiche degli
 *  ALTRI numeri gestiti si vedono DENTRO la sezione, sul chip di ogni numero. */
export function waIstanzeBadge<T extends { id: string; owner_user_id?: string | null; status?: string | null }>(
    instances: T[],
    userId: string | null | undefined,
): T[] {
    return instances.filter((i) => !!userId && i.owner_user_id === userId && i.status === "connessa");
}

export function waIstanzeVisibili<T extends { id: string; owner_user_id?: string | null; negozio?: string | null; display_name?: string | null; status?: string | null }>(
    instances: T[],
    userId: string | null | undefined,
    role: string | null | undefined,
    myStores: string[],
    opts: { soloConnesse?: boolean } = {},
): T[] {
    const scope = waScopeDi(userId, role);
    // NUMERI DI NEGOZIO AUTOMATICI (Luca 25/08): SOLO i numeri SENZA titolare
    // si condividono per nome/negozio (rilievo alto del revisore: i personali
    // hanno negozio = primary_store dal create → i colleghi si vedevano le
    // chat a vicenda). Personale = del titolare e basta.
    const condiviso = (i: T) =>
        !i.owner_user_id && (
            (!!i.negozio && myStores.some((s) => sameStore(i.negozio as string, s)))
            || (!!i.display_name && myStores.some((s) => sameStore(i.display_name as string, s))));
    return instances.filter((i) => {
        if (opts.soloConnesse && i.status !== "connessa") return false;
        if (scope === "all") return true;
        if (scope === "store") return (!!i.negozio && myStores.some((s) => sameStore(i.negozio as string, s)))
            || condiviso(i) || (!!userId && i.owner_user_id === userId);
        return (!!userId && i.owner_user_id === userId) || condiviso(i);
    });
}
