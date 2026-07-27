import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { inviaTesto } from "@/lib/evolution";

export const dynamic = "force-dynamic";

// Invia un messaggio WhatsApp in uscita su una conversazione. Il gating per
// ruolo/proprieta' e' lato client (come il resto del CRM); qui si registra
// subito il messaggio in uscita e si aggiorna l'anteprima.
export async function POST(request: Request) {
    try {
        const { conversationId, text, userId } = await request.json();
        if (!conversationId || !text?.trim()) {
            return NextResponse.json({ error: "conversationId e text obbligatori" }, { status: 400 });
        }
        const { data: conv } = await supabase
            .from("wa_conversations")
            .select("id, customer_number, instance_id, wa_instances(instance_name, status)")
            .eq("id", conversationId).maybeSingle();
        if (!conv) return NextResponse.json({ error: "conversazione non trovata" }, { status: 404 });
        const inst: any = conv.wa_instances;
        if (!inst?.instance_name) return NextResponse.json({ error: "istanza non collegata" }, { status: 400 });

        let waId: string | null = null;
        try {
            const res = await inviaTesto(inst.instance_name, conv.customer_number, text.trim());
            waId = res?.key?.id || null;
        } catch (e) {
            // registra comunque il tentativo come fallito, per non perderlo
            await supabase.from("wa_messages").insert({
                conversation_id: conversationId, direction: "out", body: text.trim(),
                status: "failed", sent_by_user_id: userId || null, wa_timestamp: new Date().toISOString(),
            });
            return NextResponse.json({ error: e instanceof Error ? e.message : "invio fallito" }, { status: 502 });
        }

        await supabase.from("wa_messages").insert({
            conversation_id: conversationId, wa_message_id: waId, direction: "out",
            body: text.trim(), status: "sent", sent_by_user_id: userId || null,
            wa_timestamp: new Date().toISOString(),
        });
        await supabase.from("wa_conversations")
            .update({ last_message_at: new Date().toISOString(), last_preview: text.trim().slice(0, 120) })
            .eq("id", conversationId);

        return NextResponse.json({ ok: true, wa_message_id: waId });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
