// CHI DECIDE QUALE MODELLO USA UNA PERSONA (Luca 28/08 sera).
//
// SOLO SERVER: legge con la chiave amministratore. Con la chiave anonima le
// query tornano VUOTE — non in errore — e la scelta dell'admin verrebbe
// ignorata in silenzio, che è il modo peggiore di sbagliare.
//
// L'ordine è quello di sempre nel CRM, dal più specifico al più generale:
//   1. la scelta DELL'UTENTE, se l'amministrazione gli ha dato la libertà
//   2. il modello impostato per lui dal pannello Permessi (persona → grado → ruolo)
//   3. il modello di sistema, come prima che tutto questo esistesse
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { capKey, CAP_AI_MODELLO, CAP_AI_LIBERTA, AI_MODELLO_DI } from "@/lib/capabilities";
import { MODELLO_DI_SISTEMA, modelloAi } from "@/lib/ai/modelli";

export type SceltaModello = {
    /** l'id del modello da usare adesso */
    modello: string;
    /** l'utente può cambiarlo da sé? (serve alla pagina per mostrare il selettore) */
    libero: boolean;
    /** quello deciso dall'amministrazione, per spiegarlo in interfaccia */
    daAmministrazione: string | null;
};

export async function modelloDi(userId: string): Promise<SceltaModello> {
    const vuoto: SceltaModello = { modello: MODELLO_DI_SISTEMA, libero: false, daAmministrazione: null };
    if (!userId) return vuoto;

    const { data: u } = await supabaseAdmin.from("app_users")
        .select("role, grade, active").eq("id", userId).maybeSingle();
    if (!u || u.active === false) return vuoto;
    const role = String(u.role || "");

    // ruolo → grado → persona, l'ultimo strato vince (come ovunque nel CRM)
    const chiavi = [role, u.grade ? `${role}@${u.grade}` : null, `user:${userId}`].filter(Boolean) as string[];
    const chiaviCap = [
        ...CAP_AI_MODELLO.caps.map((c) => capKey(CAP_AI_MODELLO.section, c.id)),
        capKey(CAP_AI_LIBERTA.section, "sceglie_modello"),
    ];
    const { data: righe } = await supabaseAdmin.from("role_permissions")
        .select("role, perm_key, allowed").in("role", chiavi).in("perm_key", chiaviCap);

    const perms = new Map<string, boolean>();
    for (const k of chiavi) (righe || []).filter((r) => r.role === k).forEach((r) => perms.set(r.perm_key, !!r.allowed));

    // il modello deciso dall'amministrazione: vince la prima scelta accesa
    let daAmm: string | null = null;
    for (const c of CAP_AI_MODELLO.caps) {
        if (perms.get(capKey(CAP_AI_MODELLO.section, c.id)) === true) { daAmm = AI_MODELLO_DI[c.id] || null; break; }
    }

    const liberoDefault = CAP_AI_LIBERTA.caps[0].default(role);
    const rigaLibero = perms.get(capKey(CAP_AI_LIBERTA.section, "sceglie_modello"));
    const libero = rigaLibero === undefined ? liberoDefault : rigaLibero;

    // la scelta personale conta SOLO se gli è stata concessa
    let sua: string | null = null;
    if (libero) {
        const { data: pref } = await supabaseAdmin.from("ai_preferenze")
            .select("modello").eq("user_id", userId).maybeSingle();
        const m = String(pref?.modello || "");
        if (m) sua = modelloAi(m).id;      // se non è più in catalogo, si torna a uno valido
    }

    return {
        modello: sua || daAmm || MODELLO_DI_SISTEMA,
        libero,
        daAmministrazione: daAmm,
    };
}
