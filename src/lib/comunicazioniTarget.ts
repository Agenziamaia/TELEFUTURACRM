"use client";

// DESTINATARI ESTESI delle comunicazioni (Luca 31/07, mig. 112): oltre ai
// RUOLI si puo' mirare a NEGOZI (chi ha quel negozio come sede), PERSONE
// singole e BRAND (chi sta in un negozio che tratta quel brand — colonna
// stores.brands, da compilare in Amministrazione). Nessun target = per tutti.
// Basta UNA corrispondenza qualsiasi per essere destinatari.
import { supabase } from "@/lib/supabaseClient";
import { sameStore } from "@/lib/visibleStores";

export type TargetEstesi = {
    target_roles: string[] | null;
    target_stores?: string[] | null;
    target_users?: string[] | null;
    target_brands?: string[] | null;
    created_by?: string | null;
};

export function comunicazionePerMe(
    c: TargetEstesi,
    io: { userId?: string | null; role?: string | null; negozio?: string | null; negozi?: string[]; brandsNegozio?: string[] },
): boolean {
    // l'AUTORE non e' mai destinatario della propria comunicazione (Luca 31/07):
    // niente popup, niente conferma, non compare tra le ricevute attese
    if (c.created_by && io.userId && c.created_by === io.userId) return false;
    const haTarget = !!(c.target_roles?.length || c.target_stores?.length || c.target_users?.length || c.target_brands?.length);
    if (!haTarget) return true;
    if (c.target_roles?.length && io.role && c.target_roles.includes(io.role)) return true;
    if (c.target_users?.length && io.userId && c.target_users.includes(io.userId)) return true;
    // "tutto lo staff del negozio": conta la sede di login E i negozi ASSEGNATI
    // (Luca 31/07: chi lavora su due punti vendita riceve per entrambi)
    if (c.target_stores?.length) {
        const miei = [io.negozio, ...(io.negozi || [])].filter(Boolean) as string[];
        if (miei.some((m) => c.target_stores!.some((s) => sameStore(s, m)))) return true;
    }
    if (c.target_brands?.length && io.brandsNegozio?.length && c.target_brands.some((b) => io.brandsNegozio!.includes(b))) return true;
    return false;
}

/** Se la comunicazione e' l'INVITO di una riunione (meeting_id, mig. 122),
 *  la risposta Accetto/Rifiuto aggiorna anche lo stato dell'invitato sulla
 *  riunione in calendario — prima i due sistemi non si parlavano (Luca 31/07:
 *  Schekella accettava dal pop-up ma sulla riunione restava "in attesa"). */
export async function sincronizzaRispostaRiunione(meetingId: number | null | undefined, userId: string | null | undefined, esito: string | null | undefined): Promise<void> {
    if (!meetingId || !userId || !esito) return;
    const status = esito === "Accetto" ? "confirmed" : esito === "Rifiuto" ? "declined" : null;
    if (!status) return;
    try {
        const { data } = await supabase.from("calendar_meetings").select("recipients").eq("id", meetingId).maybeSingle();
        const rec = (data?.recipients ?? null) as { id: string; status?: string }[] | null;
        if (!Array.isArray(rec) || !rec.some((r) => r.id === userId)) return;
        const nuovi = rec.map((r) => (r.id === userId ? { ...r, status } : r));
        await supabase.from("calendar_meetings").update({ recipients: nuovi }).eq("id", meetingId);
    } catch { /* la risposta resta comunque nelle ricevute */ }
}

/** Negozi ASSEGNATI a un utente (user_stores) — per la consegna delle
 *  comunicazioni mirate a negozio; [] se la tabella non e' leggibile. */
export async function negoziAssegnati(userId: string | null | undefined): Promise<string[]> {
    if (!userId) return [];
    try {
        const { data } = await supabase.from("user_stores").select("store_name").eq("user_id", userId);
        return ((data ?? []) as { store_name: string | null }[]).map((r) => String(r.store_name || "")).filter(Boolean);
    } catch { return []; }
}

/** Brand trattati dal negozio dell'utente (stores.brands, mig. 112);
 *  torna [] se il negozio manca o la migrazione non e' ancora applicata. */
/** Brand TRATTATI dall'utente (user_brands, mig. 112) — è QUESTA la fonte
 *  delle comunicazioni per brand. Fino al 24/08 si leggeva stores.brands,
 *  colonna VUOTA da sempre: i pop-up per brand non arrivavano a nessuno
 *  e il contatore destinatari segnava 0 (segnalazione Luca). */
export async function brandDiUtente(userId: string | null | undefined): Promise<string[]> {
    if (!userId) return [];
    try {
        const { data, error } = await supabase.from("user_brands").select("brand").eq("user_id", userId);
        if (error) return [];
        return ((data ?? []) as { brand: string | null }[]).map((r) => String(r.brand || "")).filter(Boolean);
    } catch { return []; }
}
