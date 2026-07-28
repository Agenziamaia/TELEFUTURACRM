import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { leggiNuove } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scarica le nuove email (IMAP) e le registra nel modello email_*. Aggancio al
// cliente per indirizzo. POST {accountId} -> una casella; POST {} -> tutte (cron).

async function clientePerEmail(email: string): Promise<string | null> {
    if (!email) return null;
    const { data } = await supabase.from("clients").select("id").ilike("email", email).limit(1);
    return data && data[0] ? data[0].id : null;
}

async function pollAccount(accId: string) {
    const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", accId).maybeSingle();
    if (!acc) return { error: "account non trovato" };
    let res: any;
    try { res = await leggiNuove(acc as any, 30); }
    catch (e: any) {
        await supabase.from("email_accounts").update({ status: "errore", last_error: String(e?.message || e).slice(0, 300) }).eq("id", accId);
        return { error: e?.message || String(e) };
    }
    let nuovi = 0;
    for (const m of res.messages) {
        const cust = m.fromAddr;
        if (!cust || cust === acc.email_address) continue;   // ignora auto-copie
        const clientId = await clientePerEmail(cust);
        // upsert conversazione (account + indirizzo cliente)
        const { data: existing } = await supabase.from("email_conversations").select("id, client_id, customer_name").eq("account_id", accId).eq("customer_email", cust).maybeSingle();
        let convId: string | undefined;
        if (existing) {
            convId = existing.id;
            const patch: Record<string, unknown> = {};
            if (clientId && !existing.client_id) patch.client_id = clientId;
            if (m.fromName && !existing.customer_name) patch.customer_name = m.fromName;
            if (Object.keys(patch).length) await supabase.from("email_conversations").update(patch).eq("id", convId);
        } else {
            const { data: created } = await supabase.from("email_conversations")
                .insert({ account_id: accId, customer_email: cust, customer_name: m.fromName || null, client_id: clientId, subject: m.subject }).select("id").single();
            convId = created?.id;
        }
        if (!convId) continue;
        // allegati -> bucket email-attachments
        const atts: any[] = [];
        for (const a of m.attachments) {
            try {
                const safe = (a.name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
                const path = `${convId}/${Date.now()}-${safe}`;
                const { error } = await supabase.storage.from("email-attachments").upload(path, a.content, { contentType: a.mime, upsert: true });
                if (!error) { const { data: pub } = supabase.storage.from("email-attachments").getPublicUrl(path); atts.push({ name: a.name, url: pub?.publicUrl, mime: a.mime, size: a.size }); }
            } catch { /* allegato saltato */ }
        }
        const { error: msgErr } = await supabase.from("email_messages").upsert({
            conversation_id: convId, account_id: accId, direction: "in",
            message_id: m.messageId, in_reply_to: m.inReplyTo,
            from_addr: m.fromAddr, from_name: m.fromName, to_addrs: m.to, cc_addrs: m.cc,
            subject: m.subject, body_text: m.text, body_html: m.html,
            attachments: atts, email_date: m.date ? new Date(m.date).toISOString() : null,
        }, { onConflict: "message_id" });
        if (!msgErr) {
            nuovi++;
            const preview = String(m.text || m.subject || "").replace(/\s+/g, " ").trim().slice(0, 140);
            const { data: conv } = await supabase.from("email_conversations").select("unread").eq("id", convId).maybeSingle();
            await supabase.from("email_conversations").update({
                last_message_at: m.date ? new Date(m.date).toISOString() : new Date().toISOString(),
                last_preview: preview, subject: m.subject, unread: (conv?.unread || 0) + 1,
                // una nuova risposta del cliente riporta il thread in Posta in arrivo
                // (come Gmail); lo Spam resta Spam.
                trashed: false, archived: false,
            }).eq("id", convId);
        }
    }
    await supabase.from("email_accounts").update({ last_uid: res.lastUid, status: "attiva", last_error: null }).eq("id", accId);
    return { nuovi, lastUid: res.lastUid };
}

export async function POST(request: Request) {
    try {
        const b = await request.json().catch(() => ({}));
        if (b?.accountId) return NextResponse.json(await pollAccount(b.accountId));
        const { data: accs } = await supabase.from("email_accounts").select("id").eq("status", "attiva");
        const results: any[] = [];
        for (const a of (accs || [])) results.push({ id: a.id, ...(await pollAccount(a.id)) });
        return NextResponse.json({ ok: true, results });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}

export async function GET() { return NextResponse.json({ ok: true, service: "email-poll" }); }
