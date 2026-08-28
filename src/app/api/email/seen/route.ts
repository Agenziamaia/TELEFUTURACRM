import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { flagLetteImap } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// EML-05 (Luca 05/08): la lettura fatta nel CRM vale anche in webmail.
// POST { conversationId, seen? } — seen=true (default): marca \Seen su IMAP
// tutti gli inbound del thread e azzera unread; seen=false: toglie \Seen
// all'ULTIMO inbound (per "segna da leggere") e mette unread=1.
// Fire-and-forget dal client: l'errore IMAP non blocca la lettura nel CRM
// (il poll riallineerà al giro dopo).
export async function POST(request: Request) {
    try {
        const b = await request.json().catch(() => ({}));
        const convId = String(b?.conversationId || "");
        const seen = b?.seen !== false;
        if (!convId) return NextResponse.json({ error: "conversationId mancante" }, { status: 400 });

        const { data: conv } = await supabase.from("email_conversations").select("id, account_id").eq("id", convId).maybeSingle();
        if (!conv) return NextResponse.json({ error: "conversazione non trovata" }, { status: 404 });
        const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", conv.account_id).maybeSingle();
        if (!acc) return NextResponse.json({ error: "casella non trovata" }, { status: 404 });

        const { data: msgs } = await supabase.from("email_messages").select("message_id")
            .eq("conversation_id", convId).eq("direction", "in")
            .order("email_date", { ascending: false, nullsFirst: false }).limit(seen ? 100 : 1);
        const ids = (msgs || []).map((m) => String(m.message_id || "")).filter(Boolean);

        let toccate = 0;
        try { toccate = await flagLetteImap(acc as any, ids, seen); }
        catch { /* IMAP giù: il DB comanda comunque, il poll riallineerà */ }
        await supabase.from("email_conversations").update({ unread: seen ? 0 : 1 }).eq("id", convId);
        return NextResponse.json({ ok: true, toccate });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}
