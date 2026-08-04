import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { leggiBloccoStorico, CartellaBackfill, EmailIn, EmailInAtt } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BACKFILL STORICO EMAIL (EML-01 + EML-03, decisioni Luca 04/08/2026).
// Importa lo storico a blocchi RIPRISTINABILI per le sole caselle con
// email_accounts.backfill_enabled=true (oggi: amministrazione@) e si ferma a
// 12 mesi indietro o all'inizio della cartella. Allegati inclusi. TRE fasi in
// ordine, ognuna con cursore e flag di fine dedicati:
//   1. INBOX  (backfill_seq / backfill_done)            — direction=in
//   2. Sent   (backfill_sent_seq / backfill_sent_done)  — direction=out,
//      conversazione sul PRIMO destinatario; parte SOLO a INBOX completata
//   3. Trash  (backfill_trash_seq / backfill_trash_done) — cartella individuata
//      via special-use \Trash + nomi comuni; parte SOLO a Sent completata.
// Le colonne delle fasi 2-3 arrivano con la mig. 20260804150000: finche' non
// e' applicata il route ripiega da solo sul comportamento storico (solo INBOX).
//
// LIMITE DI MODELLAZIONE del Cestino (dichiarato, non aggirato): trashed sta su
// email_conversations, NON sul singolo messaggio. Quindi: un messaggio del
// Trash IMAP il cui interlocutore ha gia' una conversazione VIVA nel CRM viene
// accodato a quella conversazione (visibile nel thread, NON nella cartella
// Cestino); solo gli interlocutori senza conversazione generano una
// conversazione nuova marcata trashed. Mai marcare trashed una conversazione
// con messaggi vivi. La soluzione pulita (colonna trashed per-messaggio +
// filtro cartelle sul messaggio) e' proposta nel report, non implementata qui.
//
// Ogni chiamata lavora al massimo ~55s e salva il cursore dopo OGNI blocco:
// si puo' interrompere e richiamare quante volte serve; quando tutte le fasi
// sono done diventa un no-op immediato.
//
// CRON SUL VPS (gia' attivo, ogni 5'): le fasi nuove partono da sole al primo
// giro dopo la migrazione. Per FORZARE UN GIRO A MANO (dal VPS via ssh):
//   curl -s -X POST http://127.0.0.1:3000/api/email/backfill -H 'Content-Type: application/json' -d '{}'
// La risposta elenca per casella le fasi lavorate (inbox/sent/trash) con
// blocchi e importati. POST {} -> tutte le caselle abilitate;
// POST { accountId } -> solo quella. Parametri opzionali:
// { block: 100 (50-200), maxMs: 55000 (10s-4min) }.
//
// GUARDIE OBBLIGATORIE (import storico, identiche in tutte le fasi): MAI
// incrementare unread, MAI toccare trashed/archived di una conversazione
// esistente, MAI spostare last_message_at all'indietro. Dedup su
// (account_id, message_id) con ignoreDuplicates: i messaggi gia' presenti
// (finestra iniziale del poll, sovrapposizioni di cursore, inviate dal CRM)
// non vengono toccati e non rigenerano eventi.

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

/** Importa UN messaggio storico nella conversazione giusta (creandola se manca).
 *  dir="in": interlocutore = mittente; dir="out": interlocutore = primo
 *  destinatario (come il sync Sent del poll). trashSeNuova=true (fase Trash):
 *  la conversazione nasce trashed SOLO se non esiste gia' — quelle esistenti
 *  non cambiano MAI stato. Ritorna true se la riga messaggio e' nuova. */
async function importaMessaggio(acc: any, m: EmailIn, dir: "in" | "out", trashSeNuova: boolean): Promise<boolean> {
    const cust = dir === "in" ? m.fromAddr : m.toFirstAddr;
    if (!cust || cust === acc.email_address) return false;   // auto-copie / auto-invii
    const clientId = await clientePerEmail(cust);
    const nome = dir === "in" ? m.fromName : m.toFirstName;
    const { data: existing } = await supabase.from("email_conversations").select("id, client_id, customer_name, last_message_at").eq("account_id", acc.id).eq("customer_email", cust).maybeSingle();
    let convId: string | undefined;
    let lastAt: string | null = null;
    if (existing) {
        convId = existing.id; lastAt = existing.last_message_at;
        // solo riempimenti: aggancio cliente e nome se mancano (retroattivo utile)
        const patch: Record<string, unknown> = {};
        if (clientId && !existing.client_id) patch.client_id = clientId;
        if (nome && !existing.customer_name) patch.customer_name = nome;
        if (Object.keys(patch).length) await supabase.from("email_conversations").update(patch).eq("id", convId);
    } else {
        const { data: created } = await supabase.from("email_conversations")
            .insert({
                account_id: acc.id, customer_email: cust, customer_name: nome || null,
                client_id: clientId, subject: m.subject,
                ...(trashSeNuova ? { trashed: true } : {}),
            }).select("id").single();
        convId = created?.id;
    }
    if (!convId) return false;
    const atts = await caricaAllegati(convId, m.attachments);
    const riga: Record<string, unknown> = {
        conversation_id: convId, account_id: acc.id, direction: dir,
        message_id: m.messageId, in_reply_to: m.inReplyTo,
        to_addrs: m.to, cc_addrs: m.cc,
        subject: m.subject, body_text: m.text, body_html: m.html,
        attachments: atts, email_date: m.date ? new Date(m.date).toISOString() : null,
    };
    if (dir === "in") { riga.from_addr = m.fromAddr; riga.from_name = m.fromName; }
    else { riga.from_addr = acc.email_address; riga.from_name = acc.display_name || m.fromName || null; riga.status = "sent"; }
    const { data: inseriti, error: msgErr } = await supabase.from("email_messages")
        .upsert(riga, { onConflict: "account_id,message_id", ignoreDuplicates: true }).select("id");
    if (msgErr || !inseriti || !inseriti.length) return false;
    // GUARDIA: last_message_at avanza SOLO se il thread era vuoto o piu' vecchio
    // del messaggio (mai all'indietro; niente unread, niente trashed/archived).
    const quando = m.date ? new Date(m.date).toISOString() : null;
    if (quando && (!lastAt || new Date(lastAt).getTime() < new Date(quando).getTime())) {
        const preview = String(m.text || m.subject || "").replace(/\s+/g, " ").trim().slice(0, 140);
        await supabase.from("email_conversations").update({ last_message_at: quando, last_preview: preview }).eq("id", convId);
    }
    return true;
}

/** Una fase del backfill (inbox/sent/trash): risale la cartella a blocchi per
 *  sequenza finche' c'e' budget tempo, salvando cursore e flag dopo OGNI blocco
 *  nei campi indicati. Stop: inizio cartella, blocco interamente oltre i 12
 *  mesi, o cartella assente sul server (fase chiusa subito). */
async function faseBackfill(acc: any, cartella: CartellaBackfill, block: number, scadenza: number, campi: { seq: string; done: string }) {
    const cutoff = Date.now() - DODICI_MESI_MS;
    let importati = 0, blocchi = 0, done = false;
    let belowSeq: number | null = acc[campi.seq] ?? null;

    while (Date.now() < scadenza && !done) {
        let blocco;
        try { blocco = await leggiBloccoStorico(acc, { belowSeq, block, cartella }); }
        catch (e: any) { return { cartella, error: String(e?.message || e).slice(0, 300), importati, blocchi, seq: belowSeq, done: false }; }
        if (!blocco.folder) {
            // il server non ha la cartella (es. niente Trash): fase chiusa
            await supabase.from("email_accounts").update({ [campi.done]: true }).eq("id", acc.id);
            return { cartella, importati, blocchi, seq: belowSeq, done: true, nota: "cartella assente sul server" };
        }
        if (blocco.hi < 1) {   // inizio cartella raggiunto
            done = true;
            await supabase.from("email_accounts").update({ [campi.seq]: 1, [campi.done]: true }).eq("id", acc.id);
            break;
        }

        for (const m of blocco.messages) {
            if (m.date && m.date.getTime() < cutoff) continue;   // oltre i 12 mesi
            // nel Trash convivono ricevute e inviate: la direzione si decide dal
            // mittente; nella Sent e' sempre out, in INBOX sempre in
            const dir: "in" | "out" = cartella === "sent" ? "out"
                : (cartella === "trash" && m.fromAddr === acc.email_address ? "out" : "in");
            if (await importaMessaggio(acc, m, dir, cartella === "trash")) importati++;
        }

        blocchi++;
        belowSeq = blocco.lo;
        // stop: inizio cartella, o blocco INTERO piu' vecchio del limite (le
        // cartelle IMAP sono in ordine ~cronologico: sotto e' ancora piu' vecchio)
        const datati = blocco.messages.filter(m => m.date);
        const tuttoOltre = datati.length > 0 && Math.max(...datati.map(m => m.date!.getTime())) < cutoff;
        if (blocco.lo <= 1 || tuttoOltre) done = true;
        await supabase.from("email_accounts").update({ [campi.seq]: belowSeq, [campi.done]: done }).eq("id", acc.id);
    }
    return { cartella, importati, blocchi, seq: belowSeq, done };
}

async function backfillAccount(acc: any, block: number, scadenza: number) {
    const out: Record<string, unknown> = {};
    // fase 1 — INBOX (comportamento storico invariato)
    if (!acc.backfill_done) {
        const r = await faseBackfill(acc, "inbox", block, scadenza, { seq: "backfill_seq", done: "backfill_done" });
        out.inbox = r;
        if (r.done) acc.backfill_done = true;   // se resta budget si prosegue subito
    }
    // fasi 2-3 (EML-03) — Sent poi Trash, SOLO a INBOX completata. Il confronto
    // STRETTO con false salta le fasi finche' la mig. 20260804150000 non e'
    // applicata (campo assente = undefined): niente lavoro senza cursore a DB.
    if (acc.backfill_done && acc.backfill_sent_done === false && Date.now() < scadenza) {
        const r = await faseBackfill(acc, "sent", block, scadenza, { seq: "backfill_sent_seq", done: "backfill_sent_done" });
        out.sent = r;
        if (r.done) acc.backfill_sent_done = true;
    }
    if (acc.backfill_done && acc.backfill_sent_done === true && acc.backfill_trash_done === false && Date.now() < scadenza) {
        out.trash = await faseBackfill(acc, "trash", block, scadenza, { seq: "backfill_trash_seq", done: "backfill_trash_done" });
    }
    return out;
}

export async function POST(request: Request) {
    try {
        const b = await request.json().catch(() => ({}));
        const block = Math.min(200, Math.max(50, Number(b?.block) || 100));
        const maxMs = Math.min(240000, Math.max(10000, Number(b?.maxMs) || 55000));
        const scadenza = Date.now() + maxMs;
        // caselle con ALMENO una fase da finire
        let q = supabase.from("email_accounts").select("*")
            .eq("backfill_enabled", true).eq("status", "attiva")
            .or("backfill_done.eq.false,backfill_sent_done.eq.false,backfill_trash_done.eq.false");
        if (b?.accountId) q = q.eq("id", b.accountId);
        let { data: accs, error } = await q;
        if (error) {
            // mig. 20260804150000 non ancora applicata: filtro storico, solo INBOX
            let q2 = supabase.from("email_accounts").select("*")
                .eq("backfill_enabled", true).eq("backfill_done", false).eq("status", "attiva");
            if (b?.accountId) q2 = q2.eq("id", b.accountId);
            ({ data: accs, error } = await q2);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
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
