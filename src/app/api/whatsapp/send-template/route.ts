import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaTesto } from "@/lib/evolution";
import { trovaOCreaConversazione } from "@/lib/waConversazioni";

export const dynamic = "force-dynamic";

/**
 * INVIO MODELLO WhatsApp dal Caller (CAL-01, Luca 04/08). A differenza di
 * /notify (automazioni: un'istanza connessa QUALSIASI), qui il messaggio parte
 * SOLO dal numero DEL caller (wa_instances con owner_user_id = userId e stato
 * "connessa") — stesso principio del waScope "own" della chat. Nessun numero
 * di riserva (decisione Luca): senza istanza connessa si risponde 409 con
 * l'invito a ricollegare il QR.
 *   { userId, number, text, templateId?, callId? }
 * Risponde { conversationId, wa_message_id } e logga in wa_template_invii
 * (rotazione anti-ban per numero + statistiche del pannello).
 */
export async function POST(request: Request) {
    // 🔒 BLINDATURA fase A (28/08): senza sessione firmata non si passa
    {
        const sess = richiedeSessione(request);
        if (!sess) return rispostaSessioneNonValida();
    }

    try {
        const { userId, number, text, templateId, callId } = await request.json();
        const dig = String(number || "").replace(/\D/g, "");
        const testo = String(text || "").trim();
        if (!userId || dig.length < 6 || !testo) {
            return NextResponse.json({ error: "userId, number e text obbligatori" }, { status: 400 });
        }

        // SOLO il numero del caller: la piu' recente delle sue istanze connesse
        const { data: insts } = await supabase.from("wa_instances")
            .select("id, instance_name, status")
            .eq("owner_user_id", userId).order("created_at", { ascending: false });
        const inst = (insts ?? []).find((i) => i.status === "connessa");
        if (!inst) {
            return NextResponse.json({ error: "Nessun tuo numero connesso: collega il QR dalla chat" }, { status: 409 });
        }

        // stessa euristica coda-9-cifre di notify/WhatsAppInbox (helper condiviso):
        // niente conversazioni doppie per lo stesso cliente
        const { conv, error: convErr } = await trovaOCreaConversazione(inst.id, dig);
        if (!conv) return NextResponse.json({ error: "conversazione non creata: " + (convErr || "?") }, { status: 500 });

        // piccolo jitter anti-pattern: gli invii da modello non partono mai a
        // cadenza perfettamente meccanica (l'invio resta comunque manuale, 1-a-1)
        await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 1100)));

        let waId: string | null = null;
        let stato = "sent";
        try {
            const res = await inviaTesto(inst.instance_name, conv.chat_jid || conv.customer_number, testo);
            waId = res?.key?.id || null;
        } catch {
            stato = "failed";
        }
        await supabase.from("wa_messages").insert({
            conversation_id: conv.id, direction: "out", body: testo,
            status: stato, wa_message_id: waId, sent_by_user_id: userId,
            wa_timestamp: new Date().toISOString(),
        });
        if (stato === "failed") {
            return NextResponse.json({ error: "invio non riuscito (istanza disconnessa?)" }, { status: 502 });
        }
        await supabase.from("wa_conversations").update({
            last_preview: testo.slice(0, 120), last_message_at: new Date().toISOString(),
        }).eq("id", conv.id);

        // log invio (best-effort: se la migrazione manca l'invio resta valido)
        await supabase.from("wa_template_invii").insert({
            template_id: templateId || null, call_id: callId || null,
            conversation_id: conv.id, wa_message_id: waId,
            user_id: userId, numero: dig,
        });

        return NextResponse.json({ ok: true, conversationId: conv.id, wa_message_id: waId });
    } catch (err) {
        const message = err instanceof Error ? err.message : "errore interno";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
