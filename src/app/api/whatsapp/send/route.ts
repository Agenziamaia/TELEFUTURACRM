import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaTesto, inviaMedia } from "@/lib/evolution";

export const dynamic = "force-dynamic";

// Invia un messaggio WhatsApp in uscita su una conversazione. Il gating per
// ruolo/proprieta' e' lato client (come il resto del CRM); qui si registra
// subito il messaggio in uscita e si aggiorna l'anteprima.
//   { conversationId, text, userId }                         -> testo
//   { conversationId, text?, userId, mediaUrl, mediaMime, fileName } -> allegato
export async function POST(request: Request) {
    // 🔒 BLINDATURA fase A (28/08): senza sessione firmata non si passa
    {
        const sess = richiedeSessione(request);
        if (!sess) return rispostaSessioneNonValida();
    }

    try {
        const { conversationId, text, userId, mediaUrl, mediaMime, fileName } = await request.json();
        const testo = (text || "").trim();
        if (!conversationId || (!testo && !mediaUrl)) {
            return NextResponse.json({ error: "conversationId e testo o allegato obbligatori" }, { status: 400 });
        }
        const { data: conv } = await supabase
            .from("wa_conversations")
            .select("id, customer_number, chat_jid, instance_id, wa_instances(instance_name, status)")
            .eq("id", conversationId).maybeSingle();
        if (!conv) return NextResponse.json({ error: "conversazione non trovata" }, { status: 404 });
        const inst: any = conv.wa_instances;
        if (!inst?.instance_name) return NextResponse.json({ error: "istanza non collegata" }, { status: 400 });
        // il JID completo (gruppo @g.us o numero) va all'invio; fallback al numero
        const destinatario = conv.chat_jid || conv.customer_number;

        let waId: string | null = null;
        try {
            const res = mediaUrl
                ? await inviaMedia(inst.instance_name, destinatario, { media: mediaUrl, mimetype: mediaMime, fileName, caption: testo })
                : await inviaTesto(inst.instance_name, destinatario, testo);
            waId = res?.key?.id || null;
        } catch (e) {
            // registra comunque il tentativo come fallito, per non perderlo
            await supabase.from("wa_messages").insert({
                conversation_id: conversationId, direction: "out", body: testo || null,
                media_url: mediaUrl || null, media_mime: mediaMime || null,
                status: "failed", sent_by_user_id: userId || null, wa_timestamp: new Date().toISOString(),
            });
            return NextResponse.json({ error: e instanceof Error ? e.message : "invio fallito" }, { status: 502 });
        }

        await supabase.from("wa_messages").insert({
            conversation_id: conversationId, wa_message_id: waId, direction: "out",
            body: testo || null, media_url: mediaUrl || null, media_mime: mediaMime || null,
            status: "sent", sent_by_user_id: userId || null, wa_timestamp: new Date().toISOString(),
        });
        const anteprima = testo || (mediaMime ? `[${mediaMime.startsWith("image/") ? "Immagine" : mediaMime.startsWith("video/") ? "Video" : mediaMime.startsWith("audio/") ? "Audio" : "Documento"}]` : "");
        await supabase.from("wa_conversations")
            .update({ last_message_at: new Date().toISOString(), last_preview: anteprima.slice(0, 120) })
            .eq("id", conversationId);

        return NextResponse.json({ ok: true, wa_message_id: waId });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
