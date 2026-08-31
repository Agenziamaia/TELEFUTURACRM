/* I PARAMETRI DEGLI AUTOMATISMI, LETTI DAL SERVER.
 *
 * L'hub li scrive in `automatismi_config`; qui li si legge. Esiste perché un
 * campo modificabile che nessuno legge è peggio di un campo che non c'è: il
 * revisore l'ha chiamata «una bugia nell'interfaccia», e aveva ragione — si
 * poteva impostare «300 chat per corsa», l'hub rispondeva «✓ Salvato», e non
 * cambiava assolutamente niente.
 *
 * Se la riga non c'è, o il valore non è un numero sensato, si torna al valore
 * di fabbrica: un parametro sbagliato non deve spegnere un lavoro. */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function parametriAutomatismo(id: string): Promise<Record<string, unknown>> {
    try {
        const { data } = await supabaseAdmin.from("automatismi_config")
            .select("parametri").eq("id", id).maybeSingle();
        const p = data?.parametri;
        return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    } catch { return {}; }
}

/** Un numero dal pannello, dentro i limiti dichiarati. */
export async function numeroAutomatismo(id: string, chiave: string, minimo: number, massimo: number): Promise<number | undefined> {
    const v = Number((await parametriAutomatismo(id))[chiave]);
    if (!Number.isFinite(v) || v < minimo || v > massimo) return undefined;
    return Math.round(v);
}
