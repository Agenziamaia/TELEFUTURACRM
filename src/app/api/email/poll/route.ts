import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { leggiNuove, leggiSentNuove, EmailInAtt } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scarica le nuove email (IMAP) e le registra nel modello email_*. Aggancio al
// cliente per indirizzo. POST {accountId} -> una casella; POST {} -> tutte.
// Il ramo "tutte" e' pensato per il cron sul VPS (vedi il commento in testa a
// /api/email/backfill per la riga di crontab): senza, una casella si aggiorna
// solo mentre qualcuno tiene aperto il tab Email su di essa.
// Oltre a INBOX sincronizza la cartella Sent IMAP (EML-01): le mail inviate da
// webmail/telefono entrano nel CRM con direction=out, conversazione sul PRIMO
// destinatario, senza toccare unread/trashed/archived.

async function clientePerEmail(email: string): Promise<string | null> {
    if (!email) return null;
    const { data } = await supabase.from("clients").select("id").ilike("email", email).limit(1);
    return data && data[0] ? data[0].id : null;
}

// allegati -> bucket email-attachments (riusato da INBOX e Sent)
async function caricaAllegati(convId: string, list: EmailInAtt[]): Promise<any[]> {
    const atts: any[] = [];
    for (const a of list) {
        try {
            const safe = (a.name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
            const path = `${convId}/${Date.now()}-${safe}`;
            const { error } = await supabase.storage.from("email-attachments").upload(path, a.content, { contentType: a.mime, upsert: true });
            if (!error) { const { data: pub } = supabase.storage.from("email-attachments").getPublicUrl(path); atts.push({ name: a.name, url: pub?.publicUrl, mime: a.mime, size: a.size }); }
        } catch { /* allegato saltato */ }
    }
    return atts;
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
        const atts = await caricaAllegati(convId, m.attachments);
        // unique per-casella (mig. 20260804120000): il conflitto NON aggiorna la
        // riga esistente (ignoreDuplicates), cosi' un ri-fetch (es. reset
        // UIDVALIDITY, sovrapposizione col backfill) non re-incrementa unread.
        const { data: inseriti, error: msgErr } = await supabase.from("email_messages").upsert({
            conversation_id: convId, account_id: accId, direction: "in",
            message_id: m.messageId, in_reply_to: m.inReplyTo,
            from_addr: m.fromAddr, from_name: m.fromName, to_addrs: m.to, cc_addrs: m.cc,
            subject: m.subject, body_text: m.text, body_html: m.html,
            attachments: atts, email_date: m.date ? new Date(m.date).toISOString() : null,
        }, { onConflict: "account_id,message_id", ignoreDuplicates: true }).select("id");
        if (!msgErr && inseriti && inseriti.length) {
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

    // ── cartella Sent: importa le inviate da fuori CRM (EML-01, causa B) ──
    // GUARDIE: mai toccare unread, mai resettare trashed/archived, mai spostare
    // last_message_at all'indietro. sent_by_user_id resta null (inviata fuori
    // dal CRM); le inviate DAL CRM (gia' a DB + APPEND sulla Sent) vengono
    // deduplicate dall'upsert su (account_id, message_id).
    let inviateImportate = 0;
    const patchSent: Record<string, unknown> = {};
    try {
        const sr = await leggiSentNuove(acc as any, 30);
        patchSent.sent_last_uid = sr.lastUid;
        if (sr.uidValidity) patchSent.sent_uidvalidity = sr.uidValidity;
        for (const m of sr.messages) {
            const dest = m.toFirstAddr;
            if (!dest || dest === acc.email_address) continue;   // niente auto-invii
            const clientId = await clientePerEmail(dest);
            // conversazione sul PRIMO destinatario (per l'inbox e' il mittente)
            const { data: existing } = await supabase.from("email_conversations").select("id, client_id, customer_name, last_message_at").eq("account_id", accId).eq("customer_email", dest).maybeSingle();
            let convId: string | undefined;
            let lastAt: string | null = null;
            if (existing) {
                convId = existing.id; lastAt = existing.last_message_at;
                const patch: Record<string, unknown> = {};
                if (clientId && !existing.client_id) patch.client_id = clientId;
                if (m.toFirstName && !existing.customer_name) patch.customer_name = m.toFirstName;
                if (Object.keys(patch).length) await supabase.from("email_conversations").update(patch).eq("id", convId);
            } else {
                const { data: created } = await supabase.from("email_conversations")
                    .insert({ account_id: accId, customer_email: dest, customer_name: m.toFirstName || null, client_id: clientId, subject: m.subject }).select("id").single();
                convId = created?.id;
            }
            if (!convId) continue;
            const atts = await caricaAllegati(convId, m.attachments);
            const { data: inseriti, error: msgErr } = await supabase.from("email_messages").upsert({
                conversation_id: convId, account_id: accId, direction: "out",
                message_id: m.messageId, in_reply_to: m.inReplyTo,
                from_addr: acc.email_address, from_name: acc.display_name || m.fromName || null,
                to_addrs: m.to, cc_addrs: m.cc,
                subject: m.subject, body_text: m.text, body_html: m.html,
                attachments: atts, status: "sent",
                email_date: m.date ? new Date(m.date).toISOString() : null,
            }, { onConflict: "account_id,message_id", ignoreDuplicates: true }).select("id");
            if (!msgErr && inseriti && inseriti.length) {
                inviateImportate++;
                const quando = m.date ? new Date(m.date).toISOString() : new Date().toISOString();
                if (!lastAt || new Date(lastAt).getTime() < new Date(quando).getTime()) {
                    const preview = String(m.text || m.subject || "").replace(/\s+/g, " ").trim().slice(0, 140);
                    await supabase.from("email_conversations").update({ last_message_at: quando, last_preview: preview, subject: m.subject }).eq("id", convId);
                }
            }
        }
    } catch { /* Sent assente o in errore: il poll INBOX resta valido */ }

    await supabase.from("email_accounts").update({
        last_uid: res.lastUid, status: "attiva", last_error: null,
        ...(res.uidValidity ? { inbox_uidvalidity: res.uidValidity } : {}),
        ...patchSent,
    }).eq("id", accId);
    return { nuovi, inviateImportate, lastUid: res.lastUid };
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
