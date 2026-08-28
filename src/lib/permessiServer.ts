// I PERMESSI DEL PANNELLO VALGONO ANCHE SUL SERVER (Luca 28/08 sera).
//
// «Devi far sì che i permessi siano collegati TUTTI alla sezione permessi del
//  pannello amministrativo, altrimenti che senso ha? Non solo per le password
//  ma per tutto il resto.»
//
// Prima di oggi il pannello governava solo quello che si VEDE: le funzioni di
// server rispondevano a chiunque avesse fatto login, quindi bastava conoscere
// l'indirizzo per fare cose che nel menu non compaiono nemmeno. Da qui esiste
// UN SOLO posto che decide: `role_permissions`, la stessa tabella della
// rotellina. Chi spegne una sezione a un ruolo la spegne davvero, ovunque.
//
// ⚠️ Non scrivere MAI elenchi di ruoli dentro una route: sarebbero una seconda
// verità che si scorda di aggiornarsi (successo il 28/08 con le password, dove
// una lista fissa aveva tagliato fuori i venditori abilitati a mano).
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { routeBases, effectiveAllowed, groupKey, groupByLabel, type PermMap } from "@/lib/nav";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";

/* ── A QUALE SEZIONE APPARTIENE OGNI FUNZIONE DI SERVER ──────────────────
   La chiave è l'indirizzo della voce di menu: è quello che il pannello
   accende e spegne. Una funzione senza sezione qui NON è libera: è solo una
   funzione che non ha una sezione propria (e resta protetta dalla sessione). */
export const SEZIONE_DI: Record<string, string> = {
    "passwords": "/password-v2",
    "whatsapp": "/chat",
    "email": "/chat",
    "ai": "/assistente",
    "vendita": "/registra-vendita",
    "pos": "/registra-vendita",
    "aircall": "/chiamate",
    "usati": "/usati",
    "dispositivi": "/magazzino",
    "smartphones": "/magazzino",
    // il report serale è un pulsante DENTRO la Chiusura Negozio: chi può
    // chiudere il negozio può mandarne il report, senza un secondo permesso
    "report": "/chiusura",
    // eccezioni più precise del primo segmento: queste due servono le
    // schermate di Amministrazione (Reparti, Marginalità, Catalogo), non le
    // sezioni operative da cui prendono il nome
    "pos/reparti": "/amministrazione",
    "usati/sync-prices": "/amministrazione",
};

/** La sezione di una route: "passwords/credentials/[id]/reveal" → "/password-v2".
 *  Vince la chiave PIÙ SPECIFICA ("pos/reparti" prima di "pos"), così una
 *  singola route può appartenere a una sezione diversa dalle sue sorelle. */
export function sezioneDellaRoute(nomeRoute: string): string | null {
    const n = String(nomeRoute || "");
    for (const k of Object.keys(SEZIONE_DI).sort((a, b) => b.length - a.length)) {
        if (n === k || n.startsWith(k + "/")) return SEZIONE_DI[k];
    }
    return null;
}

/** Il permesso EFFETTIVO di una persona su una sezione.
 *
 *  ⚠️ LA STESSA IDENTICA FUNZIONE DEL BROWSER (`effectiveAllowed` di nav.ts),
 *  sugli stessi dati. Non una seconda implementazione «equivalente»: il 28/08
 *  ne avevo scritta una a mano e sbagliava a leggere il menù (cercava le voci
 *  in `items`, che non esiste — sono in `children`). Risultato: chi non aveva
 *  una riga scritta a mano nel pannello — cioè chi eredita i valori di
 *  fabbrica, direttore generale e store manager compresi — si è visto negare
 *  le password per un'ora. Due copie della stessa regola divergono sempre:
 *  qui ne esiste una sola, e sta in nav.ts. */
export async function permessoSezione(userId: string, href: string): Promise<{ ok: boolean; role: string }> {
    try {
        const { data: u } = await supabaseAdmin.from("app_users")
            .select("role, grade, active").eq("id", userId).maybeSingle();
        const role = String(u?.role || "");
        if (!u || u.active === false) return { ok: false, role };
        if (role === "admin" || role === "dev") return { ok: true, role };

        // ruolo → grado → persona, l'ultimo strato vince (come useRolePermissions)
        const chiavi = [role, u.grade ? `${role}@${u.grade}` : null, `user:${userId}`]
            .filter(Boolean) as string[];
        const { data: righe } = await supabaseAdmin.from("role_permissions")
            .select("role, perm_key, allowed").in("role", chiavi);
        const perms: PermMap = new Map();
        for (const chiave of chiavi) {
            (righe || []).filter((x) => x.role === chiave).forEach((x) => perms.set(x.perm_key, !!x.allowed));
        }

        // la voce di menù vera, con il suo gruppo e i suoi ruoli di partenza
        const base = routeBases().find((r) => r.base === href.split("?")[0]);
        const voce = base?.items.find((i) => i.href === href) ?? base?.items[0];
        if (!voce) return { ok: false, role };    // sezione sconosciuta: chiusa

        // gerarchia: col gruppo spento la voce non conta nulla (come nel pannello)
        if (voce.group) {
            const gruppoOk = effectiveAllowed(role, groupKey(voce.group),
                groupByLabel(voce.group)?.roles ?? ["*"], perms, voce.group);
            if (!gruppoOk) return { ok: false, role };
        }
        return { ok: effectiveAllowed(role, voce.href, voce.roles, perms, voce.group), role };
    } catch {
        return { ok: false, role: "" };          // nel dubbio non si apre
    }
}

/** IL VARCO UNICO delle funzioni di server: sessione firmata + permesso della
 *  sezione. Restituisce la sessione, oppure la risposta da restituire subito.
 *
 *   const g = await accesso(request, "passwords");
 *   if (!g.ok) return g.risposta;
 *   … usa g.sess.id come identità (mai quella dichiarata dal browser)
 */
export async function accesso(request: Request, nomeRoute: string): Promise<
    { ok: true; sess: { id: string; role: string; exp: number }; risposta?: never } |
    { ok: false; sess?: never; risposta: Response }
> {
    const sess = richiedeSessione(request);
    if (!sess) return { ok: false, risposta: rispostaSessioneNonValida() };
    const href = sezioneDellaRoute(nomeRoute);
    if (!href) return { ok: true, sess };        // nessuna sezione propria: basta la sessione
    const p = await permessoSezione(sess.id, href);
    if (!p.ok) {
        return {
            ok: false,
            risposta: Response.json(
                { error: "Non hai i permessi per questa sezione. Se ti servono, chiedili all'amministrazione." },
                { status: 403 },
            ),
        };
    }
    return { ok: true, sess };
}
