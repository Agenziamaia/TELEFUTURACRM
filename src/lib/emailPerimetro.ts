/* IL PERIMETRO DELLA POSTA, PER LE ROTTE DEL SERVER (31/08).
 *
 * Le rotte `/api/email/*` girano con la chiave di servizio, che scavalca ogni
 * regola del database: là dentro non c'è nessuna rete di protezione
 * automatica, e il commento di `supabaseAdmin` lo dice chiaro — «chi lo usa
 * ha il DOVERE di applicare i permessi dell'utente PRIMA di restituire i
 * dati». Sette rotte prendevano dal browser l'id della casella o della
 * conversazione e ci lavoravano sopra senza chiedersi di chi fosse.
 *
 * Qui c'è la domanda, in un posto solo. La risposta la dà il DATABASE, con la
 * stessa funzione dell'Inbox — `tf_mie_caselle()` — quindi il lucchetto vale
 * anche qui senza doverlo ricordare a nessuno.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Gli id delle caselle che questa persona può vedere. */
export async function caselleDi(userId: string | null | undefined): Promise<string[]> {
    if (!userId) return [];
    const { data, error } = await supabaseAdmin.rpc("tf_caselle_di", { p_utente: userId });
    if (error) {
        console.error("[email] perimetro non calcolabile:", error.message);
        return [];       // nel dubbio: nessuna casella, mai tutte
    }
    return (Array.isArray(data) ? data : []).map((x) => String(x));
}

/** Questa casella è sua? */
export async function casellaSua(userId: string, accountId: string | null | undefined): Promise<boolean> {
    if (!accountId) return false;
    const { data, error } = await supabaseAdmin.rpc("tf_casella_e_sua", { p_utente: userId, p_casella: accountId });
    if (error) { console.error("[email] controllo casella:", error.message); return false; }
    return data === true;
}

/** Questa conversazione è sua? */
export async function conversazioneSua(userId: string, convId: string | null | undefined): Promise<boolean> {
    if (!convId) return false;
    const { data, error } = await supabaseAdmin.rpc("tf_conversazione_e_sua", { p_utente: userId, p_conv: convId });
    if (error) { console.error("[email] controllo conversazione:", error.message); return false; }
    return data === true;
}

/** La risposta da dare quando non lo è. Uguale ovunque, così chi la riceve
 *  capisce che è un perimetro e non un guasto. */
export function nonEtua() {
    return Response.json({ error: "Questa casella non è tra le tue." }, { status: 403 });
}
