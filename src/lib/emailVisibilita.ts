// VISIBILITÀ DELLE CASELLE EMAIL — regola UNICA, estratta da EmailInbox il
// 26/08/2026 perché serviva anche alla Chat Omnicanale.
//
// ⚠️ ESTRATTA, NON COPIATA, ed è il punto: su queste tabelle NON c'è RLS —
// il perimetro è tutto applicativo. Una seconda copia della regola è il modo
// in cui, fra qualche settimana, una delle due schermate torna a mostrare la
// posta di amministrazione@ a chi non deve vederla. Chi tocca questa funzione
// tocca TUTTE le schermate che la usano, ed è esattamente quello che serve.
//
// La regola, nell'ordine in cui decide:
//   · chi vede tutti i negozi → tutte le caselle
//   · il TITOLARE della casella → la sua, sempre
//   · chi è iscritto in email_account_users → quella casella
//   · le caselle SENZA titolare nominate come un negozio che ho in
//     visibilità → sono «di negozio» e le vede chi ci lavora
// Le caselle personali di un collega non compaiono mai: hanno un titolare.

import { seesAllStores } from "@/lib/roles";
import { matchNegozi } from "@/lib/visibleStores";

export type CasellaVisibile = {
    id: string;
    owner_user_id?: string | null;
    negozio?: string | null;
    /** casella di SERVIZIO (codici usa e getta): non è la posta di nessuno */
    uso_sistema?: boolean | null;
};

export function emailCaselleVisibili<T extends CasellaVisibile>(
    caselle: T[],
    userId: string | null | undefined,
    role: string | null | undefined,
    myStores: string[],
    membroDi: Set<string>,
): T[] {
    // LE CASELLE DI SERVIZIO NON SONO POSTA (Luca 28/08 sera): esistono solo
    // perché ci arrivano i codici di Fastweb, e si governano dal pannello
    // Amministrazione → Email. Fuori da qui — inbox, chat omnicanale,
    // contatori — non devono comparire a nessuno, admin compreso: nessuno le
    // «legge», il CRM ci pesca dentro un numero alla volta su richiesta.
    const poste = caselle.filter((a) => !a.uso_sistema);
    if (seesAllStores(role)) return poste;
    return poste.filter((a) =>
        a.owner_user_id === userId
        || membroDi.has(a.id)
        || (!a.owner_user_id && matchNegozi(a.negozio, myStores)));
}

/** le caselle di cui sono membro (email_account_users) — la seconda metà
 *  della regola, che senza una query non si può sapere */
export async function membershipEmail(
    supabase: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { account_id: string }[] | null }> } } },
    userId: string | null | undefined,
): Promise<Set<string>> {
    if (!userId) return new Set();
    const { data } = await supabase.from("email_account_users").select("account_id").eq("user_id", userId);
    return new Set((data || []).map((x) => x.account_id));
}
