import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaEmail, appendSuSent } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invia una email. Risposta: { conversationId, text, userId }. Nuova email:
// { accountId, to, subject, text, userId }. Registra il messaggio in uscita e
// APPENDE la copia sulla cartella Sent IMAP (EML-01): l'inviata dal CRM compare
// anche in webmail. L'append e' best-effort: se fallisce l'invio resta valido.
export async function POST(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "email/send");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;

    try {
        const { conversationId, accountId, to, subject, text } = await request.json();
        // 🔒 chi invia è chi ha la sessione, non chi lo dichiara
        const userId = _s.id;
        let convId = conversationId, accId = accountId, dest = to, subj = subject, inReplyTo: string | null = null;

        if (convId) {
            const { data: conv } = await supabase.from("email_conversations").select("id, account_id, customer_email, subject").eq("id", convId).maybeSingle();
            if (!conv) return NextResponse.json({ error: "conversazione non trovata" }, { status: 404 });
            accId = conv.account_id; dest = conv.customer_email;
            subj = subject || (conv.subject ? (/^re:/i.test(conv.subject) ? conv.subject : "Re: " + conv.subject) : "(senza oggetto)");
            const { data: lastIn } = await supabase.from("email_messages").select("message_id").eq("conversation_id", convId).eq("direction", "in").order("email_date", { ascending: false }).limit(1);
            inReplyTo = lastIn && lastIn[0] ? lastIn[0].message_id : null;
        }
        dest = String(dest || "").trim().toLowerCase();
        if (!accId || !dest || !text?.trim()) return NextResponse.json({ error: "destinatario, casella e testo obbligatori" }, { status: 400 });
        subj = subj || "(senza oggetto)";
        const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", accId).maybeSingle();
        if (!acc) return NextResponse.json({ error: "casella non trovata" }, { status: 404 });

        // una NUOVA composizione apre sempre un THREAD nuovo (Luca 05/08: le
        // conversazioni sono per scambio, non per indirizzo — le risposte
        // arrivano qui già con conversationId)
        if (!convId) {
            const { data: cl } = await supabase.from("clients").select("id").ilike("email", dest).limit(1);
            const { data: created } = await supabase.from("email_conversations").insert({ account_id: accId, customer_email: dest, client_id: cl && cl[0] ? cl[0].id : null, subject: subj }).select("id").single();
            convId = created?.id;
        }

        let mid = "";
        let raw: Buffer | null = null;
        try {
            const r = await inviaEmail(acc as any, { to: dest, subject: subj, text: text.trim(), html: text.trim().replace(/\n/g, "<br>"), inReplyTo });
            mid = r.messageId; raw = r.raw;
        } catch (e) {
            await supabase.from("email_messages").insert({ conversation_id: convId, account_id: accId, direction: "out", subject: subj, body_text: text.trim(), status: "failed", sent_by_user_id: userId || null, from_addr: acc.email_address, to_addrs: dest, email_date: new Date().toISOString() });
            return NextResponse.json({ error: e instanceof Error ? e.message : "invio fallito" }, { status: 502 });
        }
        await supabase.from("email_messages").insert({ conversation_id: convId, account_id: accId, direction: "out", message_id: mid || null, subject: subj, body_text: text.trim(), status: "sent", sent_by_user_id: userId || null, from_addr: acc.email_address, to_addrs: dest, email_date: new Date().toISOString() });
        await supabase.from("email_conversations").update({ last_message_at: new Date().toISOString(), last_preview: text.trim().slice(0, 140), subject: subj }).eq("id", convId);
        // copia su "Posta inviata" IMAP: stesso Message-ID della spedita, quindi il
        // sync della Sent la ritrovera' e la scartera' come duplicato (upsert).
        try { if (raw) await appendSuSent(acc as any, raw); } catch { /* best-effort: casella senza Sent o IMAP momentaneamente giu' */ }
        return NextResponse.json({ ok: true, conversationId: convId, message_id: mid });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}
