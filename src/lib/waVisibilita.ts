// VISIBILITÀ NUMERI WHATSAPP — regola UNICA, estratta da WhatsAppInbox
// (Sheekel 11/08: l'alert contava numeri che l'utente non poteva vedere).
// Modello "un numero per caller": ognuno vede i PROPRI numeri; lo store
// manager i numeri del suo negozio; SOLO Luca (id reale, non ruolo — deciso
// 28/07) ha la vista completa. Il badge deve contare ESATTAMENTE ciò che
// l'inbox mostra: stesse utenze, e solo quelle CONNESSE (l'inbox nasconde
// le chat delle disconnesse).
import { sameStore } from "@/lib/visibleStores";
import { areaOf } from "@/lib/roles";
import { capChoice, capKey, CAP_WA_VISTA, CAP_WA_CODICE, WA_SECTION } from "@/lib/capabilities";
import type { PermMap } from "@/lib/nav";
import { supabase } from "@/lib/supabaseClient";

export const WA_LUCA_ID = "0355d28b-968f-4089-93b7-b8b5eeeda40c";

export type WaScope = "all" | "store" | "own" | "cc" | "negozi_tutti" | "agenti";

export function waScopeDi(userId?: string | null, role?: string | null): WaScope {
    if (userId === WA_LUCA_ID) return "all";
    if (role === "store_manager") return "store";
    return "own";
}

/** Chi vede ANCHE i numeri personali protetti da codice: solo l'admin
 *  vero (e il titolare, che è gestito a parte nel filtro). */
export function vedeProtettiWa(userId?: string | null, role?: string | null): boolean {
    return userId === WA_LUCA_ID || role === "admin" || role === "dev";
}

/** Scope coi PERMESSI in mano (rotellina «Chat — WhatsApp», Luca 27/08):
 *  la spia «Tutti i numeri» apre la vista completa a prescindere dai
 *  negozi; per il resto vale la regola storica. */
export function waScopeConPerms(userId: string | null | undefined, role: string | null | undefined, perms: PermMap | null): WaScope {
    if (userId === WA_LUCA_ID || role === "admin" || role === "dev") return "all";
    const scelta = capChoice(role, CAP_WA_VISTA, perms);
    if (scelta === "wa_tutti") return "all";
    if (scelta === "wa_negozi_tutti") return "negozi_tutti";
    if (scelta === "wa_cc") return "cc";
    if (scelta === "wa_agenti") return "agenti";
    if (role === "store_manager") return "store";
    return "own";
}

/** Come sopra ma SENZA hook: risolve i permessi con una query (per i punti
 *  async — omni, widget, clienti). Precedenza: override utente > ruolo. */
export async function waScopeRisolto(userId?: string | null, role?: string | null): Promise<WaScope> {
    if (userId === WA_LUCA_ID || role === "admin" || role === "dev") return "all";
    try {
        const chiavi = ["wa_tutti", "wa_negozi_tutti", "wa_cc", "wa_agenti", "wa_negozi"].map((id) => capKey(WA_SECTION, id));
        const soggetti = [role || "", userId ? `user:${userId}` : ""].filter(Boolean);
        const { data } = await supabase.from("role_permissions").select("role, perm_key, allowed")
            .in("role", soggetti).in("perm_key", chiavi);
        const m: PermMap = new Map();
        // prima il ruolo, poi l'utente che lo SCAVALCA
        (data || []).filter((r) => r.role === role).forEach((r) => m.set(String(r.perm_key), !!r.allowed));
        (data || []).filter((r) => r.role !== role).forEach((r) => m.set(String(r.perm_key), !!r.allowed));
        return waScopeConPerms(userId, role, m);
    } catch { return waScopeDi(userId, role); }
}

/** I TITOLARI dei numeri sotto codice (cap «codice» accesa): i loro numeri
 *  personali non li vede nessuno oltre a loro e all'admin — nemmeno chi ha
 *  «Tutti i numeri» (Luca 27/08). */
export async function titolariProtettiWa(): Promise<Set<string>> {
    try {
        const { data } = await supabase.from("role_permissions").select("role, allowed")
            .eq("perm_key", capKey(WA_SECTION, CAP_WA_CODICE.id)).eq("allowed", true);
        const ids = new Set<string>();
        const ruoli: string[] = [];
        (data || []).forEach((r) => {
            const k = String(r.role || "");
            if (k.startsWith("user:")) ids.add(k.slice(5));
            else if (k) ruoli.push(k.split("@")[0]);   // role@grade → protegge l'intero ruolo
        });
        if (ruoli.length) {
            const { data: us } = await supabase.from("app_users").select("id").in("role", ruoli).eq("active", true);
            (us || []).forEach((u) => ids.add(String(u.id)));
        }
        return ids;
    } catch { return new Set(); }
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
    opts: { soloConnesse?: boolean; scope?: WaScope; protetti?: Set<string> | null; vedeProtetti?: boolean; ruoloDi?: (ownerId: string) => string | null | undefined } = {},
): T[] {
    const scope = opts.scope || waScopeDi(userId, role);
    // area del titolare, per i perimetri «call center» e «agenti»
    const areaOwner = (i: T) => {
        const r = i.owner_user_id ? opts.ruoloDi?.(String(i.owner_user_id)) : null;
        return r ? areaOf(String(r)) : null;
    };
    // NUMERI DI NEGOZIO AUTOMATICI (Luca 25/08): SOLO i numeri SENZA titolare
    // si condividono per nome/negozio (rilievo alto del revisore: i personali
    // hanno negozio = primary_store dal create → i colleghi si vedevano le
    // chat a vicenda). Personale = del titolare e basta.
    // la colonna negozio può portare PIÙ punti vendita separati da virgola
    // (gemelli 25/08: «Magliana W3, Magliana Multi») — ne basta uno visibile
    const negoziDi = (i: T) => String(i.negozio || "").split(",").map((s) => s.trim()).filter(Boolean);
    const condiviso = (i: T) =>
        !i.owner_user_id && (
            negoziDi(i).some((n) => myStores.some((s) => sameStore(n, s)))
            || (!!i.display_name && myStores.some((s) => sameStore(i.display_name as string, s))));
    return instances.filter((i) => {
        if (opts.soloConnesse && i.status !== "connessa") return false;
        // i numeri PERSONALI PROTETTI da codice: solo titolare e admin,
        // qualunque sia lo scope (Luca 27/08)
        if (opts.protetti && i.owner_user_id && opts.protetti.has(String(i.owner_user_id))
            && !opts.vedeProtetti && i.owner_user_id !== userId) return false;
        if (scope === "all") return true;
        // la BASE è sempre «i suoi»: personale + negozi assegnati
        const base = (!!userId && i.owner_user_id === userId) || condiviso(i)
            || (role === "store_manager" && negoziDi(i).some((n) => myStores.some((s) => sameStore(n, s))));
        if (scope === "store") return negoziDi(i).some((n) => myStores.some((s) => sameStore(n, s)))
            || condiviso(i) || (!!userId && i.owner_user_id === userId);
        // i PERIMETRI ALLARGATI (Luca 28/08): la base più il reparto scelto
        if (scope === "negozi_tutti") return base || !i.owner_user_id;   // i numeri di negozio sono quelli senza titolare
        if (scope === "cc") return base || areaOwner(i) === "cc";
        if (scope === "agenti") return base || areaOwner(i) === "ob";
        return (!!userId && i.owner_user_id === userId) || condiviso(i);
    });
}
