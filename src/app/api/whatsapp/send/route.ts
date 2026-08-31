import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaTesto, inviaMedia } from "@/lib/evolution";
import { chatSua, nonEtuo } from "@/lib/waPerimetro";

export const dynamic = "force-dynamic";

// Invia un messaggio WhatsApp in uscita su una conversazione.
// ⚠️ Il commento diceva «il gating per ruolo/proprietà è lato client»: cioè
// nessuno, perché il client si aggira aprendo la console. Con la chiave di
// servizio si scriveva al cliente di un altro negozio USCENDO DAL SUO NUMERO.
// Dal 31/08 la conversazione dev'essere fra quelle che questa persona vede.
//   { conversationId, text, userId }                         -> testo
//   { conversationId, text?, userId, mediaUrl, mediaMime, fileName } -> allegato
export async function POST(request: Request) {
    // 🔒 BLINDATURA fase A (28/08): senza sessione firmata non si passa
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "whatsapp/send");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;

    try {
        const { conversationId, text, mediaUrl, mediaMime, fileName } = await request.json();
        if (!(await chatSua(_s.id, String(conversationId || "")))) return nonEtuo();
        // 🔒 chi invia è chi ha la sessione, non chi lo dichiara
        const userId = _s.id;
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
            /* ⚠️ L'ALLEGATO DEVE ESSERE RAGGIUNGIBILE DA FUORI (31/08).
               Da quando i depositi sono privati, il client manda un indirizzo
               che passa dal nostro custode — «/api/file/…» — e il custode
               pretende una sessione. Ma a scaricare il file qui non siamo
               noi: è il servizio che manda i messaggi, che sta fuori e di
               sessioni non ne ha. Con l'indirizzo relativo non ci arriva
               nemmeno. Quindi si firma qui, adesso: un indirizzo vero, che
               vale un'ora — il tempo di consegnarlo e nemmeno un minuto in
               più. È un errore che avevo introdotto stamattina intercettando
               getPublicUrl senza pensare a chi sta dall'altra parte. */
            let mediaFirmato: string | null = mediaUrl || null;
            const m = String(mediaUrl || "").match(/^\/api\/file\/([^/]+)\/(.+)$/);
            if (m) {
                const { data: f } = await supabase.storage.from(m[1]).createSignedUrl(decodeURIComponent(m[2]), 3600);
                if (!f?.signedUrl) {
                    return NextResponse.json({ error: "allegato non recuperabile" }, { status: 500 });
                }
                mediaFirmato = f.signedUrl;
            }

            const res = mediaUrl
                ? await inviaMedia(inst.instance_name, destinatario, { media: mediaFirmato as string, mimetype: mediaMime, fileName, caption: testo })
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
