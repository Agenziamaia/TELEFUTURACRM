import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { caselleDi, casellaSua, nonEtua } from "@/lib/emailPerimetro";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { leggiNuove, leggiSentNuove, EmailInAtt, oggettoRadice, pareRisposta, nonLetteInbox } from "@/lib/email";

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

// Conversazione del THREAD (Luca 05/08: «le mail dello stesso mittente devono
// rimanere separate» — una conversazione per scambio, non per indirizzo):
// 1) In-Reply-To → conversazione del messaggio citato; 2) oggetto da risposta
// (Re:/R:/Fwd:) senza header → ultima conversazione dello stesso interlocutore
// con la stessa radice d'oggetto; 3) altrimenti null = conversazione NUOVA.
async function convDelThread(accId: string, interlocutore: string, m: { inReplyTo: string | null; subject: string }): Promise<string | null> {
    if (m.inReplyTo) {
        const { data } = await supabase.from("email_messages").select("conversation_id")
            .eq("account_id", accId).eq("message_id", m.inReplyTo).maybeSingle();
        if (data?.conversation_id) return data.conversation_id;
    }
    if (pareRisposta(m.subject)) {
        const radice = oggettoRadice(m.subject);
        if (radice) {
            const { data } = await supabase.from("email_conversations").select("id, subject")
                .eq("account_id", accId).eq("customer_email", interlocutore)
                .order("last_message_at", { ascending: false, nullsFirst: false }).limit(15);
            const hit = (data || []).find((c) => oggettoRadice(c.subject) === radice);
            if (hit) return hit.id;
        }
    }
    return null;
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

async function pollAccountRaw(accId: string) {
    const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", accId).maybeSingle();
    if (!acc) return { error: "account non trovato" };
    // CASELLE DI SERVIZIO (28/08): quelle dei codici usa e getta non si
    // scaricano MAI. Salvare quei messaggi vorrebbe dire tenere i codici in
    // chiaro nel database e farli comparire nelle conversazioni: il CRM ci
    // entra solo su richiesta, legge un numero e non lascia traccia del numero.
    if (acc.uso_sistema) return { skipped: true, motivo: "casella di servizio (codici): non si archivia" };
    let res: any;
    try { res = await leggiNuove(acc as any, 30); }
    catch (e: any) {
        // Solo un fallimento di AUTENTICAZIONE (password cambiata sul server)
        // rende la casella davvero "da ricollegare". Errori transitori — troppe
        // connessioni IMAP simultanee sulla stessa casella (cPanel ne consente
        // poche), timeout, rete giù — NON devono ribaltare la riga condivisa a
        // status="errore": la casella è vista da più utenti (direttore
        // commerciale + negozio) e una collisione temporanea la faceva risultare
        // "disconnessa" a TUTTI (Luca 08/08). Lasciamo lo stato com'è e si
        // riprova al giro dopo. Vedi anche il lock/debounce per-casella sotto.
        if (e?.authenticationFailed) {
            await supabase.from("email_accounts").update({ status: "errore", last_error: String(e?.message || e).slice(0, 300) }).eq("id", accId);
        }
        return { error: e?.message || String(e), transient: !e?.authenticationFailed };
    }
    let nuovi = 0;
    for (const m of res.messages) {
        const cust = m.fromAddr;
        if (!cust || cust === acc.email_address) continue;   // ignora auto-copie
        const clientId = await clientePerEmail(cust);
        // conversazione del THREAD (non più una per mittente — Luca 05/08)
        let convId: string | undefined = (await convDelThread(accId, cust, m)) || undefined;
        if (convId) {
            const { data: existing } = await supabase.from("email_conversations").select("id, client_id, customer_name").eq("id", convId).maybeSingle();
            const patch: Record<string, unknown> = {};
            if (clientId && !existing?.client_id) patch.client_id = clientId;
            if (m.fromName && !existing?.customer_name) patch.customer_name = m.fromName;
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
            // conversazione del THREAD sul PRIMO destinatario (Luca 05/08)
            let convId: string | undefined = (await convDelThread(accId, dest, m)) || undefined;
            let lastAt: string | null = null;
            if (convId) {
                const { data: existing } = await supabase.from("email_conversations").select("id, client_id, customer_name, last_message_at").eq("id", convId).maybeSingle();
                lastAt = existing?.last_message_at ?? null;
                const patch: Record<string, unknown> = {};
                if (clientId && !existing?.client_id) patch.client_id = clientId;
                if (m.toFirstName && !existing?.customer_name) patch.customer_name = m.toFirstName;
                if (Object.keys(patch).length) await supabase.from("email_conversations").update(patch).eq("id", convId);
            } else {
                const { data: created } = await supabase.from("email_conversations")
                    .insert({ account_id: accId, customer_email: dest, customer_name: m.toFirstName || null, client_id: clientId, subject: m.subject }).select("id").single();
                convId = created?.id;
            }
            if (!convId) continue;
            /* ⚠️ PRIMA SI GUARDA SE CE L'ABBIAMO GIÀ (revisore 02/09). Ogni
               mail spedita dal CRM viene ricopiata sulla Sent IMAP, e da lì
               torna indietro a questo giro: l'`upsert` la scarta come
               doppione, ma `caricaAllegati` era già passato e aveva ricaricato
               una SECONDA copia di ogni allegato nel deposito — orfana, che
               nessuno cancella e nessuno vede. Finora non si notava perché
               dal CRM non partiva niente con allegati: da oggi sì. */
            if (m.messageId) {
                const { data: gia } = await supabase.from("email_messages")
                    .select("id").eq("account_id", accId).eq("message_id", m.messageId).limit(1);
                if (gia && gia.length) continue;
            }
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

    // ── EML-05 (Luca 05/08): contatori non lette allineati alla webmail ──
    // La verità sono i flag \Seen IMAP: si contano le UNSEEN reali in INBOX e
    // i contatori delle conversazioni si riallineano (Magliana: CRM 63 vs
    // webmail 12). La lettura nel CRM propaga \Seen via /api/email/seen,
    // quindi il riallineamento non ribalta ciò che leggi qui.
    let unreadAllineate = 0;
    try {
        const { ids, troncate } = await nonLetteInbox(acc as any);
        const mappa: Record<string, number> = {};
        const arr = [...new Set(ids)];
        for (let i = 0; i < arr.length; i += 100) {
            const { data } = await supabase.from("email_messages").select("conversation_id")
                .eq("account_id", accId).in("message_id", arr.slice(i, i + 100));
            (data || []).forEach((r: { conversation_id: string }) => { mappa[r.conversation_id] = (mappa[r.conversation_id] || 0) + 1; });
        }
        // stato attuale dei contatori: UNA lettura, poi aggiornamenti IN BLOCCO
        // (il primo giro faceva 2 chiamate per conversazione: su amministrazione
        // erano migliaia e il giro sforava il timeout del proxy)
        const { data: attuali } = await supabase.from("email_conversations").select("id, unread")
            .eq("account_id", accId).gt("unread", 0).limit(2000);
        const attualiMap = new Map((attuali || []).map((c: { id: string; unread: number }) => [c.id, c.unread]));
        // azzera SOLO se la lista UNSEEN è completa (se troncata, niente zeri al buio)
        const daAzzerare = troncate ? [] : (attuali || []).filter((c: { id: string }) => !mappa[c.id]).map((c: { id: string }) => c.id);
        for (let i = 0; i < daAzzerare.length; i += 100) {
            const blocco = daAzzerare.slice(i, i + 100);
            await supabase.from("email_conversations").update({ unread: 0 }).in("id", blocco);
            unreadAllineate += blocco.length;
        }
        // conteggi da impostare, raggruppati per valore (quasi tutti 1 → una chiamata)
        const perN: Record<number, string[]> = {};
        for (const [cid, n] of Object.entries(mappa)) {
            if (attualiMap.get(cid) === n) continue;
            (perN[n] = perN[n] || []).push(cid);
        }
        for (const [n, cids] of Object.entries(perN)) {
            for (let i = 0; i < cids.length; i += 100) {
                const blocco = cids.slice(i, i + 100);
                await supabase.from("email_conversations").update({ unread: Number(n) }).in("id", blocco);
                unreadAllineate += blocco.length;
            }
        }
    } catch { /* IMAP momentaneamente giù: si riallinea al giro dopo */ }

    await supabase.from("email_accounts").update({
        last_uid: res.lastUid, status: "attiva", last_error: null,
        ...(res.uidValidity ? { inbox_uidvalidity: res.uidValidity } : {}),
        ...patchSent,
    }).eq("id", accId);
    return { nuovi, inviateImportate, unreadAllineate, lastUid: res.lastUid };
}

// DEDUP PER-CASELLA (Luca 08/08): la stessa casella è vista da più utenti (es.
// direttore commerciale + il negozio). Ognuno lancia il poll all'apertura, al
// ritorno sul tab e ogni 45s; il cron VPS aggiunge un altro giro. Due login
// IMAP simultanei sulla STESSA casella cPanel = "too many connections" e la riga
// condivisa finiva status="errore" -> a tutti "disconnessa". Qui: un solo poll
// per volta per casella, e debounce sui poll ravvicinati. In-memory come il lock
// esistente (pm2 istanza singola). Il refresh MANUALE passa force e bypassa il
// debounce (ma resta serializzato dall'in-flight lock).
const pollInCorso = new Set<string>();
const ultimoPoll = new Map<string, number>();
const POLL_DEBOUNCE_MS = 25000;

async function pollAccount(accId: string, force = false): Promise<any> {
    // in-flight: MAI due poll insieme sulla stessa casella (vale anche col force,
    // così il refresh manuale non si accavalla col giro automatico né col cron).
    if (pollInCorso.has(accId)) return { skipped: "poll già in corso su questa casella" };
    // debounce: i poll ravvicinati di utenti diversi collassano in uno solo. Il
    // force (refresh manuale) salta il debounce ma resta serializzato dall'in-flight.
    if (!force && Date.now() - (ultimoPoll.get(accId) || 0) < POLL_DEBOUNCE_MS) return { skipped: "casella aggiornata da poco" };
    // check→add senza await in mezzo: atomico nel singolo processo Node (come pollTutteInCorso).
    pollInCorso.add(accId);
    try { return await pollAccountRaw(accId); }
    finally { pollInCorso.delete(accId); ultimoPoll.set(accId, Date.now()); }
}

// LOCK anti-sovrapposizione (05/08): il giro completo può superare il timeout
// del proxy — nginx risponde 504 ma il lavoro prosegue; senza lucchetto il cron
// rilancia e i giri si accavallano sulle stesse caselle. Uno alla volta.
let pollTutteInCorso = false;

export async function POST(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    // 🔒 sessione firmata + permesso della sezione, come nel pannello
    const _g = await accesso(request, "email/poll");
    if (!_g.ok) return _g.risposta;
    const _s = _g.sess;

    try {
        const b = await request.json().catch(() => ({}));
        if (b?.accountId) {
            /* ⚠️ SOLO LE SUE (31/08): con un id qualunque si aveva il
               contatore in tempo reale di una casella altrui — quante mail
               nuove, quante importate — e si faceva lavorare il server per
               conto proprio su una casella protetta. */
            if (!(await casellaSua(_s.id, String(b.accountId)))) return nonEtua();
            return NextResponse.json(await pollAccount(b.accountId, b?.force === true));
        }
        if (pollTutteInCorso) return NextResponse.json({ ok: true, skipped: "giro precedente ancora in corso" });
        pollTutteInCorso = true;
        try {
            const { data: accs } = await supabase.from("email_accounts").select("id").eq("status", "attiva");
            const results: any[] = [];
            for (const a of (accs || [])) {
                try { results.push({ id: a.id, ...(await pollAccount(a.id)) }); }
                catch (e) { results.push({ id: a.id, error: e instanceof Error ? e.message : String(e) }); }
            }
            /* ⚠️ IL GIRO resta su tutte — è manutenzione, e serve che ogni
               casella venga scaricata anche quando il suo titolare non è
               collegato (le caselle di servizio dei codici comprese, che
               nessuno «possiede»). Quello che torna INDIETRO no: chi ha
               chiesto vede i numeri delle sue e basta. */
            const mie = new Set(await caselleDi(_s.id));
            return NextResponse.json({ ok: true, results: results.filter((r) => mie.has(String(r.id))) });
        } finally { pollTutteInCorso = false; }
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(request: Request) {
    // 🔒 anche il "ci sei?" chiede la sessione (28/08 sera): il lucchetto
    // stava solo sul POST e la guardia controllava il FILE, non il verbo.
    const _g = await accesso(request, "email/poll");
    if (!_g.ok) return _g.risposta;
    return NextResponse.json({ ok: true, service: "email-poll" });
}
