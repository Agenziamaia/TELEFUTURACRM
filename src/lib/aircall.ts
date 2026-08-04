// Helper server-side per Aircall. Le credenziali stanno SOLO nelle env del
// server (AIRCALL_API_ID / AIRCALL_API_TOKEN, senza NEXT_PUBLIC): non finiscono
// nel bundle del browser. aircallGet/aircallPost e trovaClientePerNumero vanno
// usati SOLO da route handler / codice server; le funzioni PURE in coda al file
// (soloCifre, codaNumero, eventoAnyTime, puoAscoltareRegistrazioni) sono
// importabili anche dalle pagine client.

import { supabase } from "@/lib/supabaseClient";

const API = "https://api.aircall.io/v1";

function authHeader(): string {
    const id = process.env.AIRCALL_API_ID || "";
    const token = process.env.AIRCALL_API_TOKEN || "";
    return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

export async function aircallGet(path: string): Promise<any> {
    const res = await fetch(API + path, { headers: { Authorization: authHeader() } });
    if (!res.ok) throw new Error(`Aircall GET ${path} -> ${res.status}`);
    return res.json();
}

export async function aircallPost(path: string, body: unknown): Promise<any> {
    const res = await fetch(API + path, {
        method: "POST",
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Aircall POST ${path} -> ${res.status}: ${txt.slice(0, 300)}`);
    return txt ? JSON.parse(txt) : {};
}

/** Solo cifre; per il confronto con i clienti si usano le ultime 9 (numero IT
 *  senza prefisso), cosi' "+39 333 1234567" e "3331234567" coincidono. */
export function soloCifre(s: string | null | undefined): string {
    return String(s || "").replace(/\D/g, "");
}
export function codaNumero(s: string | null | undefined, n = 9): string {
    const d = soloCifre(s);
    return d.length >= n ? d.slice(-n) : d;
}

// ── AIR-01 (Luca 04/08): helper condivisi del registro chiamate ──────────────

/** Utenze/numeri di AnyTime Fitness: convivono nello STESSO account Aircall ma
 *  sono un'altra azienda. Il webhook account-wide riversava anche le loro
 *  chiamate nel CRM Telefutura: si scartano all'ingresso e si escludono dalle
 *  viste per le righe storiche già a DB. */
export const ANYTIME_NUMBER_IDS = [1214147, 1214152, 1214153] as const;
export const ANYTIME_USER_RANGE: readonly [number, number] = [1872001, 1872004];
export function eventoAnyTime(aircallUserId?: number | null, aircallNumberId?: number | null): boolean {
    if (aircallUserId != null && aircallUserId >= ANYTIME_USER_RANGE[0] && aircallUserId <= ANYTIME_USER_RANGE[1]) return true;
    if (aircallNumberId != null && (ANYTIME_NUMBER_IDS as readonly number[]).includes(aircallNumberId)) return true;
    return false;
}

/** DECISIONE Luca 04/08: l'AUDIO delle registrazioni si ascolta da store
 *  manager in su; il registro SENZA audio lo vede tutto il negozio. Funzione
 *  pura: la usano sia il proxy /api/aircall/recording (gate a DB) sia i player
 *  nelle pagine (per non mostrare un audio che poi risponderebbe 403). */
export function puoAscoltareRegistrazioni(role: string | null | undefined): boolean {
    return [
        "store_manager", "supervisore", "direttore_commerciale",
        "direttore_cc", "direttore_ob", "back_office_caller",
        // i caller riascoltano le proprie chiamate del call center (funzione
        // preesistente): la restrizione "store manager in su" nasce per il
        // registro dei NEGOZI, non per il flusso caller.
        "caller",
        "amministrativo", "direttore_generale", "admin", "dev",
    ].includes(role || "");
}

/** MATCH CLIENTE dal numero chiamante (AIR-01b) — fonte unica per webhook e
 *  flussi futuri. Priorità: cellulare > numeri aggiuntivi (client_numeri,
 *  mig. 121) > telefono fisso (i business chiamano dal fisso). Il confronto è
 *  sulla CODA di 9 cifre come TAIL ESATTO delle cifre (mai ilike cieco con
 *  limit 1); secondo giro con le cifre intervallate da % per i numeri salvati
 *  con spazi/trattini, come già fa il ponte Caller. Con più anagrafiche sullo
 *  stesso numero (caso reale: consumer+business) si LOGGA l'ambiguità e si
 *  sceglie la più vecchia (deterministico). SOLO lato server. */
export async function trovaClientePerNumero(numero: string | null | undefined): Promise<{ clientId: string | null; ambiguo: boolean }> {
    const coda = codaNumero(numero);
    if (coda.length < 6) return { clientId: null, ambiguo: false };
    const patt = `%${coda}%`;
    const pattSparso = "%" + coda.split("").join("%") + "%";
    const tailOk = (v: string | null | undefined) => codaNumero(v) === coda;

    const scegli = (ids: string[], fonte: string): { clientId: string; ambiguo: boolean } | null => {
        const unici = [...new Set(ids)];
        if (unici.length === 0) return null;
        if (unici.length > 1) {
            // le query ordinano per created_at asc: unici[0] è l'anagrafica più vecchia
            console.warn(`[aircall] match ambiguo su ${fonte} per coda ${coda}: ${unici.join(", ")}`);
            return { clientId: unici[0], ambiguo: true };
        }
        return { clientId: unici[0], ambiguo: false };
    };

    // 1+3) cellulare / telefono fisso del cliente
    const cercaClients = async (campo: "cellulare" | "telefono_fisso"): Promise<string[]> => {
        for (const p of [patt, pattSparso]) {
            const { data } = await supabase.from("clients")
                .select(`id, ${campo}, created_at`).ilike(campo, p)
                .order("created_at", { ascending: true }).limit(10);
            const righe = (data ?? []) as unknown as Record<string, unknown>[];
            const ids = righe.filter((c) => tailOk(c[campo] as string)).map((c) => String(c.id));
            if (ids.length) return ids;
        }
        return [];
    };

    let hit = scegli(await cercaClients("cellulare"), "clients.cellulare");
    if (hit) return hit;

    // 2) numeri aggiuntivi etichettati (client_numeri)
    for (const p of [patt, pattSparso]) {
        const { data } = await supabase.from("client_numeri")
            .select("client_id, numero, created_at").ilike("numero", p)
            .order("created_at", { ascending: true }).limit(10);
        const ids = (data ?? []).filter((r: { numero: string | null }) => tailOk(r.numero))
            .map((r: { client_id: string }) => String(r.client_id));
        if (ids.length) { hit = scegli(ids, "client_numeri"); break; }
    }
    if (hit) return hit;

    hit = scegli(await cercaClients("telefono_fisso"), "clients.telefono_fisso");
    return hit ?? { clientId: null, ambiguo: false };
}
