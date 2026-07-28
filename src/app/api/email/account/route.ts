import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { impostazioniPer, cifra, testConnessione } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Caselle email del CRM (una per negozio). Amministrazione lato client come il
// resto del CRM; la password viene cifrata qui e non torna MAI al browser.
//  GET                                             -> elenco (senza password)
//  POST { action:"connect", email, password, ... } -> testa e collega
//  POST { action:"test",  ... }                     -> solo test credenziali
//  POST { action:"delete", id }                     -> scollega

export async function GET() {
    const { data } = await supabase.from("email_accounts")
        .select("id, negozio, owner_user_id, email_address, display_name, status, last_error, created_at")
        .order("created_at", { ascending: false });
    return NextResponse.json({ accounts: data ?? [] });
}

export async function POST(request: Request) {
    try {
        const b = await request.json();
        const action = b?.action;

        if (action === "connect" || action === "test") {
            const email = String(b.email || "").trim().toLowerCase();
            const password = String(b.password || "");
            if (!email || !password) return NextResponse.json({ error: "email e password obbligatorie" }, { status: 400 });
            const auto = impostazioniPer(email);
            const acc = {
                email_address: email,
                display_name: b.displayName || null,
                username: (b.username || email).trim(),
                pass_enc: cifra(password),
                imap_host: b.imapHost || auto.imap_host,
                imap_port: Number(b.imapPort) || auto.imap_port,
                smtp_host: b.smtpHost || auto.smtp_host,
                smtp_port: Number(b.smtpPort) || auto.smtp_port,
                last_uid: 0,
            };
            // verifica login IMAP + SMTP prima di salvare
            try { await testConnessione(acc as any); }
            catch (e: any) { return NextResponse.json({ error: "Connessione non riuscita — " + (e?.message || e) }, { status: 400 }); }

            if (action === "test") return NextResponse.json({ ok: true, settings: auto });

            // negozio del proprietario (per la visibilita', come WhatsApp)
            let negozio: string | null = b.negozio || null;
            if (!negozio && b.ownerUserId) {
                const { data: ow } = await supabase.from("app_users").select("primary_store").eq("id", b.ownerUserId).maybeSingle();
                negozio = ow?.primary_store || null;
            }
            const { data, error } = await supabase.from("email_accounts").insert({
                ...acc, negozio, owner_user_id: b.ownerUserId || null, status: "attiva",
            }).select("id, email_address, negozio, display_name, status").single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, account: data });
        }

        if (action === "delete") {
            await supabase.from("email_accounts").delete().eq("id", b.id);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "action non valida" }, { status: 400 });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}
