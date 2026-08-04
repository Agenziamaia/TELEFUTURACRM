import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { leggiBloccoStorico, EmailInAtt } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BACKFILL STORICO EMAIL (EML-01, decisioni Luca 04/08/2026).
// Importa lo storico INBOX a blocchi RIPRISTINABILI per le sole caselle con
// email_accounts.backfill_enabled=true (oggi: amministrazione@) e si ferma a
// 12 mesi indietro o all'inizio della casella. Allegati inclusi. Ogni chiamata
// lavora al massimo ~55s e salva il cursore (backfill_seq) dopo OGNI blocco:
// si puo' interrompere e richiamare quante volte serve, e quando
// backfill_done=true diventa un no-op immediato.
//
// CRON SUL VPS (Luca via ssh) — le due righe da mettere in `crontab -e`:
//   # backfill storico amministrazione@ (no-op quando finito):
//   */5 * * * * curl -s -X POST http://127.0.0.1:3000/api/email/backfill -H 'Content-Type: application/json' -d '{}' >/dev/null 2>&1
//   # poll di TUTTE le caselle attive — ramo gia' esistente di /api/email/poll
//   # che finora NESSUNO chiamava (una casella si aggiornava solo col tab
//   # Email aperto su di essa); il poll fa anche il sync della cartella Sent:
//   */2 * * * * curl -s -X POST http://127.0.0.1:3000/api/email/poll -H 'Content-Type: application/json' -d '{}' >/dev/null 2>&1
//
// POST {} -> tutte le caselle abilitate; POST { accountId } -> solo quella
// (deve comunque avere backfill_enabled=true). Parametri opzionali:
// { block: 100 (50-200), maxMs: 55000 (10s-4min) }.
//
// GUARDIE OBBLIGATORIE (import storico): MAI incrementare unread, MAI resettare
// trashed/archived, MAI spostare last_message_at all'indietro. Direction=in,
// dedup su (account_id, message_id) con ignoreDuplicates: i messaggi gia'
// presenti (finestra iniziale di 30, sovrapposizioni di cursore) non vengono
// toccati e non rigenerano eventi.

const DODICI_MESI_MS = 365 * 24 * 3600 * 1000;

async function clientePerEmail(email: string): Promise<string | null> {
    if (!email) return null;
    const { data } = await supabase.from("clients").select("id").ilike("email", email).limit(1);
    return data && data[0] ? data[0].id : null;
}

// allegati -> bucket email-attachments (stesso giro del poll)
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

async function backfillAccount(acc: any, block: number, scadenza: number) {
    const cutoff = Date.now() - DODICI_MESI_MS;
    let importati = 0, blocchi = 0, done = false;
    let belowSeq: number | null = acc.backfill_seq ?? null;

    while (Date.now() < scadenza && !done) {
        let blocco;
        try { blocco = await leggiBloccoStorico(acc, { belowSeq, block }); }
        catch (e: any) { return { error: String(e?.message || e).slice(0, 300), importati, blocchi, backfill_seq: belowSeq, backfill_done: false }; }
        if (blocco.hi < 1) {   // inizio casella raggiunto
            done = true;
            await supabase.from("email_accounts").update({ backfill_seq: 1, backfill_done: true }).eq("id", acc.id);
            break;
        }

        for (const m of blocco.messages) {
            if (m.date && m.date.getTime() < cutoff) continue;   // oltre i 12 mesi
            const cust = m.fromAddr;
            if (!cust || cust === acc.email_address) continue;   // ignora auto-copie
            const clientId = await clientePerEmail(cust);
            const { data: existing } = await supabase.from("email_conversations").select("id, client_id, customer_name, last_message_at").eq("account_id", acc.id).eq("customer_email", cust).maybeSingle();
            let convId: string | undefined;
            let lastAt: string | null = null;
            if (existing) {
                convId = existing.id; lastAt = existing.last_message_at;
                // solo riempimenti: aggancio cliente e nome se mancano (retroattivo utile)
                const patch: Record<string, unknown> = {};
                if (clientId && !existing.client_id) patch.client_id = clientId;
                if (m.fromName && !existing.customer_name) patch.customer_name = m.fromName;
                if (Object.keys(patch).length) await supabase.from("email_conversations").update(patch).eq("id", convId);
            } else {
                const { data: created } = await supabase.from("email_conversations")
                    .insert({ account_id: acc.id, customer_email: cust, customer_name: m.fromName || null, client_id: clientId, subject: m.subject }).select("id").single();
                convId = created?.id;
            }
            if (!convId) continue;
            const atts = await caricaAllegati(convId, m.attachments);
            const { data: inseriti, error: msgErr } = await supabase.from("email_messages").upsert({
                conversation_id: convId, account_id: acc.id, direction: "in",
                message_id: m.messageId, in_reply_to: m.inReplyTo,
                from_addr: m.fromAddr, from_name: m.fromName, to_addrs: m.to, cc_addrs: m.cc,
                subject: m.subject, body_text: m.text, body_html: m.html,
                attachments: atts, email_date: m.date ? new Date(m.date).toISOString() : null,
            }, { onConflict: "account_id,message_id", ignoreDuplicates: true }).select("id");
            if (!msgErr && inseriti && inseriti.length) {
                importati++;
                // GUARDIA: last_message_at avanza SOLO se il thread era vuoto o
                // piu' vecchio del messaggio (mai all'indietro; niente unread,
                // niente reset trashed/archived).
                const quando = m.date ? new Date(m.date).toISOString() : null;
                if (quando && (!lastAt || new Date(lastAt).getTime() < new Date(quando).getTime())) {
                    const preview = String(m.text || m.subject || "").replace(/\s+/g, " ").trim().slice(0, 140);
                    await supabase.from("email_conversations").update({ last_message_at: quando, last_preview: preview }).eq("id", convId);
                }
            }
        }

        blocchi++;
        belowSeq = blocco.lo;
        // stop: inizio casella, o blocco INTERO piu' vecchio del limite (la
        // INBOX e' in ordine ~cronologico: sotto e' tutto ancora piu' vecchio)
        const datati = blocco.messages.filter(m => m.date);
        const tuttoOltre = datati.length > 0 && Math.max(...datati.map(m => m.date!.getTime())) < cutoff;
        if (blocco.lo <= 1 || tuttoOltre) done = true;
        await supabase.from("email_accounts").update({ backfill_seq: belowSeq, backfill_done: done }).eq("id", acc.id);
    }
    return { importati, blocchi, backfill_seq: belowSeq, backfill_done: done };
}

export async function POST(request: Request) {
    try {
        const b = await request.json().catch(() => ({}));
        const block = Math.min(200, Math.max(50, Number(b?.block) || 100));
        const maxMs = Math.min(240000, Math.max(10000, Number(b?.maxMs) || 55000));
        const scadenza = Date.now() + maxMs;
        let q = supabase.from("email_accounts").select("*")
            .eq("backfill_enabled", true).eq("backfill_done", false).eq("status", "attiva");
        if (b?.accountId) q = q.eq("id", b.accountId);
        const { data: accs, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!accs || accs.length === 0) return NextResponse.json({ ok: true, results: [], note: "nessuna casella da backfillare" });
        const results: any[] = [];
        for (const acc of accs) {
            if (Date.now() >= scadenza) break;
            results.push({ id: acc.id, email: acc.email_address, ...(await backfillAccount(acc, block, scadenza)) });
        }
        return NextResponse.json({ ok: true, results });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}

export async function GET() { return NextResponse.json({ ok: true, service: "email-backfill" }); }
