import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { modificaTesto, cancellaMessaggio } from "@/lib/evolution";

export const dynamic = "force-dynamic";

// Modifica / cancellazione "per tutti" di un messaggio WhatsApp in uscita
// (CHT-02). NIENTE "rimuovi solo dal CRM" (deciso da Luca): l'unica
// cancellazione e' quella vera su WhatsApp. Le finestre temporali sono quelle
// imposte da WhatsApp e si bloccano QUI, prima di chiamare Evolution, che
// fuori finestra risponde con errori opachi.
//   { action:"edit",   messageId, userId, text }
//   { action:"delete", messageId, userId }

// Stesse finestre mostrate dalla UI (WhatsAppInbox): 14 minuti per la modifica
// (buffer sotto i 15 di WhatsApp), 48 ore per l'elimina-per-tutti (sotto la
// finestra WhatsApp di ~2,5 giorni).
const FINESTRA_MODIFICA_MS = 14 * 60 * 1000;
const FINESTRA_CANCELLA_MS = 48 * 60 * 60 * 1000;

// Chi puo' agire (deciso da Luca): l'autore del messaggio o la vista completa.
// Stesso principio di waScope in WhatsAppInbox: la vista completa e' SOLO Luca
// (ID reale, non un ruolo). Per i messaggi senza autore (mandati dal telefono
// o dalle automazioni) decide il proprietario del numero, oltre a Luca.
const LUCA_ID = "0355d28b-968f-4089-93b7-b8b5eeeda40c";

// Se il messaggio toccato era l'ULTIMO della conversazione, l'anteprima in
// elenco va riallineata: altrimenti la lista chat mostrerebbe un testo che su
// WhatsApp non esiste piu'.
async function aggiornaAnteprimaSeUltimo(conversationId: string, messageId: string, anteprima: string) {
    const { data: ultimo } = await supabase.from("wa_messages")
        .select("id").eq("conversation_id", conversationId)
        .order("wa_timestamp", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
    if (ultimo?.id === messageId) {
        await supabase.from("wa_conversations").update({ last_preview: anteprima.slice(0, 120) }).eq("id", conversationId);
    }
}

export async function POST(request: Request) {
    try {
        const { action, messageId, userId, text } = await request.json();
        if (!messageId || !userId || (action !== "edit" && action !== "delete")) {
            return NextResponse.json({ error: "action ('edit'|'delete'), messageId e userId obbligatori" }, { status: 400 });
        }

        const { data: msg } = await supabase.from("wa_messages")
            .select("id, conversation_id, direction, body, body_prev, media_url, status, wa_message_id, sent_by_user_id, wa_timestamp, created_at, deleted_at")
            .eq("id", messageId).maybeSingle();
        if (!msg) return NextResponse.json({ error: "messaggio non trovato" }, { status: 404 });

        const { data: conv } = await supabase.from("wa_conversations")
            .select("id, customer_number, chat_jid, instance_id, wa_instances(instance_name, status, owner_user_id)")
            .eq("id", msg.conversation_id).maybeSingle();
        if (!conv) return NextResponse.json({ error: "conversazione non trovata" }, { status: 404 });
        const inst: any = conv.wa_instances;
        if (!inst?.instance_name) return NextResponse.json({ error: "istanza non collegata" }, { status: 400 });

        // ── permesso: autore, vista completa, o proprietario del numero per i
        //    messaggi senza autore (telefono / automazioni) ──
        const autorizzato = userId === LUCA_ID
            || (msg.sent_by_user_id ? msg.sent_by_user_id === userId : inst.owner_user_id === userId);
        if (!autorizzato) return NextResponse.json({ error: "non autorizzato su questo messaggio" }, { status: 403 });

        // ── guardie comuni ──
        if (msg.direction !== "out") return NextResponse.json({ error: "si puo' agire solo sui messaggi inviati" }, { status: 400 });
        if (!msg.wa_message_id) return NextResponse.json({ error: "messaggio senza id WhatsApp: non modificabile" }, { status: 400 });
        if (msg.deleted_at) return NextResponse.json({ error: "messaggio gia' eliminato" }, { status: 400 });
        // un "failed" su WhatsApp non esiste: niente da modificare o cancellare la'
        if (msg.status === "failed") return NextResponse.json({ error: "il messaggio non e' mai partito (invio fallito)" }, { status: 400 });

        const eta = Date.now() - new Date(msg.wa_timestamp || msg.created_at).getTime();
        // JID di destinazione: quello completo della chat (gruppi inclusi),
        // fallback sul numero come fa la route di invio
        const remoteJid = conv.chat_jid || `${String(conv.customer_number).replace(/\D/g, "")}@s.whatsapp.net`;

        if (action === "edit") {
            const testo = String(text || "").trim();
            if (!testo) return NextResponse.json({ error: "testo obbligatorio" }, { status: 400 });
            // WhatsApp non modifica i media (al piu' la caption): qui solo testo puro
            if (msg.media_url) return NextResponse.json({ error: "i messaggi con allegato non si possono modificare" }, { status: 400 });
            if (eta > FINESTRA_MODIFICA_MS) return NextResponse.json({ error: "finestra di modifica scaduta (15 minuti di WhatsApp)" }, { status: 400 });

            try {
                await modificaTesto(inst.instance_name, remoteJid, msg.wa_message_id, testo);
            } catch (e) {
                return NextResponse.json({ error: e instanceof Error ? e.message : "modifica non riuscita" }, { status: 502 });
            }
            // body_prev conserva la versione ORIGINALE (audit): non si sovrascrive
            await supabase.from("wa_messages")
                .update({ body: testo, edited_at: new Date().toISOString(), body_prev: msg.body_prev ?? msg.body })
                .eq("id", msg.id);
            await aggiornaAnteprimaSeUltimo(conv.id, msg.id, testo);
            return NextResponse.json({ ok: true });
        }

        // action === "delete" — elimina PER TUTTI (best-effort, come sull'app)
        if (eta > FINESTRA_CANCELLA_MS) return NextResponse.json({ error: "finestra di cancellazione scaduta (48 ore)" }, { status: 400 });
        try {
            await cancellaMessaggio(inst.instance_name, remoteJid, msg.wa_message_id);
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : "cancellazione non riuscita" }, { status: 502 });
        }
        // la riga resta (audit): la UI mostra il segnaposto "Messaggio eliminato"
        await supabase.from("wa_messages").update({ deleted_at: new Date().toISOString() }).eq("id", msg.id);
        await aggiornaAnteprimaSeUltimo(conv.id, msg.id, "Messaggio eliminato");
        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
