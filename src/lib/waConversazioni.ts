// Aggancio numero → conversazione WhatsApp (CAL-01): euristica CONDIVISA.
// La stessa logica viveva copiata in /api/whatsapp/notify e in WhatsAppInbox
// (rischio conversazioni doppie se una copia diverge): l'aggancio avviene per
// CODA di 9 cifre — indifferente al prefisso 39/+39 — e alla creazione il
// numero italiano a 10 cifre si normalizza anteponendo "39".

import { supabase } from "@/lib/supabaseClient";

export type ConversazioneWa = { id: string; customer_number: string; chat_jid: string | null };

/** "3331234567" → "393331234567" (prefisso Italia se manca); altrimenti le sole cifre. */
export function normalizzaNumeroWa(numero: string): string {
    const dig = String(numero || "").replace(/\D/g, "");
    return dig.length === 10 && dig.startsWith("3") ? "39" + dig : dig;
}

/** Pattern ilike per l'aggancio a coda di 9 cifre (come il ponte Aircall). */
export function pattCodaWa(numero: string): string {
    const dig = String(numero || "").replace(/\D/g, "");
    return "%" + dig.slice(-9).split("").join("%") + "%";
}

/** Trova (per coda cifre) o crea la conversazione col numero sull'istanza data. */
export async function trovaOCreaConversazione(
    instanceId: string,
    numero: string,
): Promise<{ conv: ConversazioneWa | null; error: string | null }> {
    const { data: trovate } = await supabase.from("wa_conversations")
        .select("id, customer_number, chat_jid").eq("instance_id", instanceId)
        .ilike("customer_number", pattCodaWa(numero)).limit(1);
    let conv = ((trovate ?? [])[0] as ConversazioneWa | undefined) ?? null;
    if (!conv) {
        const { data: creata, error: ce } = await supabase.from("wa_conversations")
            .insert({ instance_id: instanceId, customer_number: normalizzaNumeroWa(numero), unread: 0 })
            .select("id, customer_number, chat_jid").maybeSingle();
        if (ce || !creata) return { conv: null, error: ce?.message || "conversazione non creata" };
        conv = creata as ConversazioneWa;
    }
    return { conv, error: null };
}
