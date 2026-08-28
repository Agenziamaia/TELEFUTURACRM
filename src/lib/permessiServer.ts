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
import { NAVIGATION } from "@/lib/nav";
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
};

/** La sezione di una route: "passwords/credentials/[id]/reveal" → "/password-v2" */
export function sezioneDellaRoute(nomeRoute: string): string | null {
    const primo = String(nomeRoute || "").split("/")[0];
    return SEZIONE_DI[primo] || null;
}

/** I ruoli che vedono una sezione quando non c'è nessuna riga esplicita:
 *  quelli scritti nella voce di menu, così la verità resta una sola. */
function ruoliDiPartenza(href: string): string[] {
    try {
        for (const g of (NAVIGATION as unknown as { items?: { href?: string; roles?: string[] }[] }[])) {
            const voce = g?.items?.find((v) => v?.href === href);
            if (voce?.roles?.length) return voce.roles;
        }
    } catch { /* nessuna voce trovata */ }
    return [];
}

/** Il permesso EFFETTIVO di una persona su una sezione, con la stessa
 *  precedenza della rotellina: eccezione sulla PERSONA → sul RUOLO+GRADO →
 *  sul RUOLO → default della voce di menu. */
export async function permessoSezione(userId: string, href: string): Promise<{ ok: boolean; role: string }> {
    try {
        const { data: u } = await supabaseAdmin.from("app_users")
            .select("role, grade, active").eq("id", userId).maybeSingle();
        const role = String(u?.role || "");
        if (!u || u.active === false) return { ok: false, role };
        if (role === "admin" || role === "dev") return { ok: true, role };

        const perPersona = `user:${userId}`;
        const perGrado = u.grade ? `${role}@${u.grade}` : null;
        const chiavi = [perPersona, perGrado, role].filter(Boolean) as string[];
        const { data: righe } = await supabaseAdmin.from("role_permissions")
            .select("role, allowed").eq("perm_key", href).in("role", chiavi);

        for (const chiave of chiavi) {           // già in ordine di specificità
            const r = (righe || []).find((x) => x.role === chiave);
            if (r) return { ok: !!r.allowed, role };
        }
        return { ok: ruoliDiPartenza(href).includes(role), role };
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
