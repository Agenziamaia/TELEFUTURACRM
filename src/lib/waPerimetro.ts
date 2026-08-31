/* IL PERIMETRO DI WHATSAPP, PER LE ROTTE DEL SERVER (31/08).
 *
 * Il gemello di `emailPerimetro`. La posta l'abbiamo chiusa stamattina; qui
 * non c'era niente, e il commento di `whatsapp/send` lo diceva a chiare
 * lettere: «il gating per ruolo/proprietà è lato client». Cioè: nessuno.
 *
 * Con la chiave di servizio, che scavalca ogni regola del database, si
 * mandava un WhatsApp al cliente di un altro negozio USCENDO DAL NUMERO di
 * quel negozio, e si scaricava lo storico di una conversazione altrui.
 *
 * ⚠️ La regola non si riscrive: la dà `tf_wa_istanze()`, la stessa da cui
 * dipendono la chat e i lucchetti dei numeri personali.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Questo numero è suo? */
export async function numeroSuo(userId: string, istanzaId: string | null | undefined): Promise<boolean> {
    if (!istanzaId) return false;
    const { data, error } = await supabaseAdmin.rpc("tf_numero_e_suo", { p_utente: userId, p_istanza: istanzaId });
    if (error) { console.error("[wa] controllo numero:", error.message); return false; }
    return data === true;
}

/** Questa conversazione è sua? */
export async function chatSua(userId: string, convId: string | null | undefined): Promise<boolean> {
    if (!convId) return false;
    const { data, error } = await supabaseAdmin.rpc("tf_chat_e_sua", { p_utente: userId, p_conv: convId });
    if (error) { console.error("[wa] controllo chat:", error.message); return false; }
    return data === true;
}

/** Gli id dei numeri che questa persona vede. */
export async function numeriDi(userId: string | null | undefined): Promise<string[]> {
    if (!userId) return [];
    const { data, error } = await supabaseAdmin.rpc("tf_numeri_di", { p_utente: userId });
    if (error) { console.error("[wa] perimetro:", error.message); return []; }
    return (Array.isArray(data) ? data : []).map((x) => String(x));
}

export function nonEtuo() {
    return Response.json({ error: "Questo numero non è tra i tuoi." }, { status: 403 });
}
