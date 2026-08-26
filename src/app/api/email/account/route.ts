import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { impostazioniPer, cifra, testConnessione } from "@/lib/email";
import { seesAllStores } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Caselle email del CRM (una per negozio). Amministrazione lato client come il
// resto del CRM; la password viene cifrata qui e non torna MAI al browser.
//  GET                                             -> elenco (senza password)
//  POST { action:"connect", email, password, ... } -> testa e collega
//  POST { action:"test",  ... }                     -> solo test credenziali
//  POST { action:"delete", id, userId }             -> elimina casella + storico (cascade)


export async function GET() {
    const { data } = await supabase.from("email_accounts")
        .select("id, negozio, owner_user_id, email_address, display_name, status, last_error, created_at")
        .order("created_at", { ascending: false });
    return NextResponse.json({ accounts: data ?? [] });
}

// GOVERNANCE (Luca 26/08): le caselle si collegano, ricollegano ed eliminano
// SOLO dall'amministrazione (Pannello Email). Backstop server-side: chi vede
// tutti i negozi; il gate fine per-persona (capacità CAP_EMAIL_ADMIN) sta nel
// client come per il resto del CRM. Prima il connect era senza alcun check.
async function eAmministrazione(userId: string): Promise<boolean> {
    if (!userId) return false;
    const { data: chi } = await supabase.from("app_users")
        .select("id, role, active").eq("id", userId).maybeSingle();
    return !!chi && chi.active !== false && seesAllStores(chi.role);
}

export async function POST(request: Request) {
    try {
        const b = await request.json();
        const action = b?.action;

        if (action === "connect" || action === "test") {
            if (!(await eAmministrazione(String(b.userId || "")))) {
                return NextResponse.json({ error: "le caselle si collegano solo dal pannello Email dell'amministrazione" }, { status: 403 });
            }
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

            // Se la casella e' GIA' collegata (stesso indirizzo), la RI-collego invece
            // di fallire con "duplicate key ...email_address_key": aggiorno credenziali
            // e impostazioni. Cosi' "Collega" vale anche come "ri-collega" (es. password
            // cambiata o casella riassegnata). last_uid resta invariato -> niente
            // re-import della posta gia' scaricata.
            const { data: existing } = await supabase.from("email_accounts")
                .select("id").eq("email_address", email).maybeSingle();
            if (existing) {
                const upd: any = {
                    username: acc.username, pass_enc: acc.pass_enc,
                    imap_host: acc.imap_host, imap_port: acc.imap_port,
                    smtp_host: acc.smtp_host, smtp_port: acc.smtp_port,
                    negozio, owner_user_id: b.ownerUserId || null, status: "attiva", last_error: null,
                };
                if (acc.display_name) upd.display_name = acc.display_name;
                const { data, error } = await supabase.from("email_accounts")
                    .update(upd).eq("id", existing.id)
                    .select("id, email_address, negozio, display_name, status").single();
                if (error) return NextResponse.json({ error: error.message }, { status: 500 });
                return NextResponse.json({ ok: true, account: data, reconnected: true });
            }

            const { data, error } = await supabase.from("email_accounts").insert({
                ...acc, negozio, owner_user_id: b.ownerUserId || null, status: "attiva",
            }).select("id, email_address, negozio, display_name, status").single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, account: data });
        }

        if (action === "retest") {
            // PROVA CONNESSIONE con le credenziali GIÀ salvate (pannello Email):
            // decifra la password e ritenta login IMAP+SMTP, aggiornando lo
            // stato — per capire al volo se una casella «in errore» è guarita.
            if (!(await eAmministrazione(String(b.userId || "")))) {
                return NextResponse.json({ error: "riservato al pannello Email dell'amministrazione" }, { status: 403 });
            }
            const id = String(b.id || "");
            if (!id) return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });
            const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", id).maybeSingle();
            if (!acc) return NextResponse.json({ error: "casella non trovata" }, { status: 404 });
            try {
                await testConnessione(acc as any);
                await supabase.from("email_accounts").update({ status: "attiva", last_error: null }).eq("id", id);
                return NextResponse.json({ ok: true });
            } catch (e: any) {
                const msg = String(e?.message || e).slice(0, 300);
                await supabase.from("email_accounts").update({ status: "errore", last_error: msg }).eq("id", id);
                return NextResponse.json({ error: msg }, { status: 400 });
            }
        }

        if (action === "delete") {
            // ELIMINAZIONE COMPLETA (decisione Luca 04/08): via la casella dal CRM
            // con TUTTO lo storico scaricato (cascade su conversazioni, messaggi,
            // bozze). La casella reale sul server di posta NON viene toccata.
            // GOVERNANCE 26/08: STRETTA alla sola amministrazione — prima potevano
            // anche il proprietario della casella e lo store manager del negozio.
            const id = String(b.id || "");
            const userId = String(b.userId || "");
            if (!id || !userId) return NextResponse.json({ error: "id e userId obbligatori" }, { status: 400 });
            const { data: acc } = await supabase.from("email_accounts")
                .select("id, owner_user_id, negozio").eq("id", id).maybeSingle();
            if (!acc) return NextResponse.json({ error: "casella non trovata" }, { status: 404 });
            if (!(await eAmministrazione(userId))) {
                return NextResponse.json({ error: "le caselle si eliminano solo dal pannello Email dell'amministrazione" }, { status: 403 });
            }

            // pulizia BEST-EFFORT del bucket allegati (path: <convId>/<file>) prima
            // della delete: dopo il cascade i file resterebbero orfani per sempre.
            try {
                const { data: convIds } = await supabase.from("email_conversations").select("id").eq("account_id", id);
                for (const c of convIds || []) {
                    const { data: files } = await supabase.storage.from("email-attachments").list(c.id, { limit: 1000 });
                    if (files && files.length) {
                        await supabase.storage.from("email-attachments").remove(files.map(f => `${c.id}/${f.name}`));
                    }
                }
            } catch { /* allegati orfani tollerati: non bloccano l'eliminazione */ }

            const { error } = await supabase.from("email_accounts").delete().eq("id", id);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "action non valida" }, { status: 400 });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}
