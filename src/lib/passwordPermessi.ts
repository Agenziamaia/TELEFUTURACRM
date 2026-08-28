// CHI PUÒ VEDERE LE PASSWORD AZIENDALI (28/08 sera).
//
// La voce di menu «Password» è sempre stata riservata a pochi ruoli
// (src/lib/nav.ts), ma il controllo viveva SOLO nel menu: le funzioni di
// server rispondevano a chiunque avesse fatto login — quindi a tutti i 50
// dipendenti, non ai tre ruoli previsti. Qui la regola diventa vera, e sta
// in un posto solo.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** gli stessi ruoli della voce di menu, più dev per manutenzione */
export const RUOLI_PASSWORD = ["admin", "dev", "direttore_generale", "store_manager"];

/** Il ruolo si rilegge dal database, non si prende dal permesso di sessione:
 *  un declassamento deve valere subito, non alla scadenza del permesso. */
export async function puoVederePassword(userId: string): Promise<{ ok: boolean; role: string }> {
    try {
        const { data } = await supabaseAdmin.from("app_users")
            .select("role, active").eq("id", userId).maybeSingle();
        const role = String(data?.role || "");
        if (!data || data.active === false) return { ok: false, role };
        return { ok: RUOLI_PASSWORD.includes(role), role };
    } catch {
        return { ok: false, role: "" };   // nel dubbio non si apre il caveau
    }
}
